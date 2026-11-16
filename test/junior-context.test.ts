import { jest } from "@jest/globals";
import {
  textTokenEstimate,
  contentTokenEstimate,
  contextWindow,
  tokenGauge,
  estimateContext,
  composeRequest,
  tokenLabel,
} from "../app/utils/context-meter";
import {
  compactionPlan,
  recentTurnCut,
  createContextSummary,
  activeSummary,
  normalizeSummary,
  historyDigest,
  splitSummaryInput,
  parseSemanticSummary,
  summarizeTranscript,
} from "../app/utils/context-compaction";
import {
  WORKFLOWS,
  workflowInstruction,
} from "../app/config/workflow-templates";
import {
  WORKFLOW_SPECIALISTS,
  specialistId,
  specialistPrompt,
  selectSpecialist,
} from "../app/config/workflow-specialists";
import { buildConversationExport } from "../app/utils/friend-export";
import { validateStudyPayload } from "../app/utils/vault-merge";
const session = () =>
  ({
    memoryPrompt: "",
    messages: Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? "assistant" : "user",
      content: `记录 ${i} ` + "保留关键公式和文件事实。".repeat(20),
      date: "",
    })),
  }) as any;
test("portable backups preserve validated specialist and compaction metadata without model settings", async () => {
  const s = session();
  Object.assign(s, {
    id: "portable",
    topic: "Test",
    lastUpdate: 123,
    workflowId: "cs-code",
    contextWindow: 256000,
    autoCompact: true,
    clearContextIndex: 0,
    mask: { modelConfig: { reasoningEffort: "xhigh" } },
  });
  s.contextSummary = createContextSummary(
    s,
    compactionPlan(s),
    "Valid short technical summary",
    "ai",
  );
  const exported = await buildConversationExport([s], async (url) => url);
  const payload = validateStudyPayload({
    format: "campus-study-data",
    version: 1,
    createdAt: new Date().toISOString(),
    sessions: exported.sessions,
    notes: [],
    macros: [],
    appearance: { mode: "auto", palette: "green" },
  });
  expect(payload.sessions[0]).toMatchObject({
    workflowId: "cs-code",
    contextWindow: 256000,
    autoCompact: true,
    clearContextIndex: 0,
    contextSummary: s.contextSummary,
  });
  expect(activeSummary(payload.sessions[0] as any)).not.toBeNull();
  expect(payload.sessions[0]).not.toHaveProperty("mask");
  const invalid = validateStudyPayload({
    ...payload,
    sessions: [
      {
        ...payload.sessions[0],
        workflowId: "__proto__",
        contextWindow: 12,
        contextSummary: { text: "bad" },
      },
    ],
  });
  expect(invalid.sessions[0].workflowId).toBeUndefined();
  expect(invalid.sessions[0].contextWindow).toBeUndefined();
  expect(invalid.sessions[0].contextSummary).toBeUndefined();
});
test("fourteen cards each have distinct rigorous persistent specialist instruction", () => {
  expect(WORKFLOWS).toHaveLength(14);
  expect(Object.keys(WORKFLOW_SPECIALISTS).sort()).toEqual(
    WORKFLOWS.map((f) => f.id).sort(),
  );
  const texts = WORKFLOWS.map((f) => {
    expect(selectSpecialist(f.id)).toBe(f.id);
    expect(workflowInstruction(f.id)).toContain(
      WORKFLOW_SPECIALISTS[f.id as keyof typeof WORKFLOW_SPECIALISTS],
    );
    return specialistPrompt(f.id);
  });
  expect(new Set(texts).size).toBe(14);
  expect(texts.every((t) => t.includes("模块专攻锁定") && t.length > 250)).toBe(
    true,
  );
  expect(specialistId("__proto__")).toBeUndefined();
  expect(specialistPrompt(undefined)).toBe("");
  expect(() => selectSpecialist("bad")).toThrow();
});
test("mixed language token estimate and images use explicit bounded heuristics", () => {
  expect(textTokenEstimate("abcd")).toBe(1);
  expect(textTokenEstimate("中文")).toBe(3);
  expect(textTokenEstimate("😀")).toBe(2);
  expect(textTokenEstimate("")).toBe(0);
  expect(
    contentTokenEstimate([
      { type: "text", text: "abcd" },
      { type: "image_url", image_url: { url: "data:huge" } },
    ]),
  ).toBe(1537);
  expect(contextWindow()).toBe(1000000);
  expect(contextWindow(256000)).toBe(256000);
  expect(tokenLabel(24500)).toBe("24.5k");
});
test.each([
  [649999, "green", false],
  [650000, "amber", false],
  [750000, "amber", true],
  [850000, "amber", true],
  [850001, "coral", true],
  [1100000, "coral", true],
] as const)("gauge threshold %d", (total, tone, shouldCompact) =>
  expect(tokenGauge(total, 1000000)).toMatchObject({
    tone,
    shouldCompact,
    width: Math.min(100, total / 10000),
    exceeded: total > 1000000,
  }),
);
test("relay mode rescales thresholds and invalid estimates are rejected", () => {
  expect(tokenGauge(192000, 256000)).toMatchObject({
    percent: 75,
    shouldCompact: true,
  });
  expect(() => tokenGauge(NaN, 1000000)).toThrow();
  expect(() => tokenGauge(-1, 1000000)).toThrow();
});
test("context breakdown includes system, all history, attachments, draft and RAG without mutating inputs", () => {
  const history = [
      { role: "system" as const, content: "System" },
      { role: "user" as const, content: "hello\n[附件：facts.txt]\n数据" },
      { role: "assistant" as const, content: "answer" },
    ],
    draft = {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "next" },
        {
          type: "image_url" as const,
          image_url: { url: "data:image/png;base64,AA" },
        },
      ],
    },
    before = JSON.stringify({ history, draft }),
    p = estimateContext(history, draft, "specialist", "RAG facts");
  expect(p.filesRag).toBeGreaterThan(1536);
  expect(p.imageCount).toBe(1);
  expect(p.total).toBe(p.system + p.history + p.filesRag);
  expect(p.total).toBeGreaterThan(estimateContext(history, draft).total);
  const request = composeRequest(history, draft, "specialist", "RAG facts");
  expect(request[0]).toEqual({
    role: "system",
    content: "specialist\n\nRAG facts",
  });
  expect(request.at(-1)).toBe(draft);
  expect(JSON.stringify({ history, draft })).toBe(before);
});
test("compaction keeps last three user turns intact and retains original messages", () => {
  const s = session(),
    before = JSON.stringify(s),
    plan = compactionPlan(s);
  expect(plan.cut).toBe(6);
  expect(plan.raw).toEqual(s.messages.slice(6));
  expect(plan.throughId).toBe("m5");
  const summary = createContextSummary(
    s,
    plan,
    "目标与结论；保留公式。",
    "ai",
    123,
  );
  expect(summary.createdAt).toBe(123);
  expect(activeSummary({ ...s, contextSummary: summary })?.through).toBe(5);
  expect(JSON.stringify(s)).toBe(before);
  expect(() =>
    compactionPlan({ ...s, messages: s.messages.slice(0, 6) }),
  ).toThrow();
});
test("latest three turns are defined by user starts despite multiple assistant/tool messages", () => {
  expect(
    recentTurnCut([
      { role: "system" },
      { role: "user" },
      { role: "assistant" },
      { role: "assistant" },
      { role: "user" },
      { role: "assistant" },
      { role: "user" },
      { role: "assistant" },
      { role: "user" },
    ]),
  ).toBe(4);
  expect(() => recentTurnCut([], 0)).toThrow();
});
test("digest detects changed early messages, while unrelated appended messages do not invalidate summary", () => {
  const s = session(),
    plan = compactionPlan(s),
    summary = createContextSummary(s, plan, "summary", "local");
  expect(
    activeSummary({
      ...s,
      contextSummary: summary,
      messages: [...s.messages, { id: "new", role: "user", content: "next" }],
    }),
  ).not.toBeNull();
  s.messages[0].content = "edited";
  expect(activeSummary({ ...s, contextSummary: summary })).toBeNull();
  expect(() => createContextSummary(s, plan, "summary", "ai")).toThrow(/变化/);
});
test("clear-context boundary excludes old memory and invalidates previous summary", () => {
  const s = session(),
    old = createContextSummary(s, compactionPlan(s), "summary", "local");
  s.clearContextIndex = 2;
  s.memoryPrompt = "must not leak";
  const plan = compactionPlan(s);
  expect(plan.text).not.toContain("must not leak");
  expect(plan.start).toBe(2);
  expect(plan.earlier[0].id).toBe("m2");
  expect(activeSummary({ ...s, contextSummary: old })).toBeNull();
  s.clearContextIndex = 8;
  expect(() => compactionPlan(s)).toThrow();
});
test("second compaction merges previous summary and new prefix, retaining original digest source", () => {
  const s = session(),
    summary = createContextSummary(s, compactionPlan(s), "earlier facts", "ai");
  s.contextSummary = summary;
  s.messages.push(
    { id: "m12", role: "user", content: "new task" },
    { id: "m13", role: "assistant", content: "new answer" },
  );
  const p = compactionPlan(s);
  expect(p.text).toContain("earlier facts");
  expect(p.earlier.map((m: any) => m.id)).toEqual(["m6", "m7"]);
  expect(p.raw[0].id).toBe("m8");
  expect(p.digest).toBe(historyDigest(s.messages.slice(0, 8)));
});
test("image and file facts are handled honestly and streaming is rejected", () => {
  const s = session();
  s.messages[0].content = [
    { type: "text", text: "see image" },
    { type: "image_url", image_url: { url: "data:private-image" } },
  ];
  s.messages[1].sources = [{ label: "document p2", text: "voltage 12V" }];
  const p = compactionPlan(s);
  expect(p.text).toContain("未在本次摘要中读取");
  expect(p.text).not.toContain("data:private-image");
  expect(p.text).toContain("document p2");
  expect(p.text).toContain("voltage 12V");
  s.messages[2].streaming = true;
  expect(() => compactionPlan(s)).toThrow(/等待/);
});
test("invalid, blank, oversized and non-reducing summaries are rejected", () => {
  const s = session(),
    p = compactionPlan(s);
  expect(() => createContextSummary(s, p, "", "ai")).toThrow();
  expect(() =>
    createContextSummary(s, p, "长".repeat(12001), "local"),
  ).toThrow();
  expect(() => createContextSummary(s, p, p.text, "ai")).toThrow();
  for (const v of [
    null,
    {},
    {
      text: "x",
      throughId: "a",
      digest: "bad",
      startIndex: 0,
      createdAt: 1,
      method: "ai",
    },
  ])
    expect(normalizeSummary(v)).toBeUndefined();
});
test("token-bounded chunking preserves Unicode text and order", () => {
  const text = "中文😀abc\n".repeat(1500),
    chunks = splitSummaryInput(text, 1000);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.join("")).toBe(text);
  expect(chunks.every((c) => textTokenEstimate(c) <= 1000)).toBe(true);
  expect(chunks.every((c) => !/[\uD800-\uDBFF]$/.test(c))).toBe(true);
  expect(() => splitSummaryInput(text, 1)).toThrow();
  expect(() => splitSummaryInput("中".repeat(25000), 1000)).toThrow(/分批/);
});
test("semantic output requires completed envelope and strips model thinking", () => {
  expect(
    parseSemanticSummary(
      "<think>secret</think><campus-summary> facts </campus-summary>",
    ),
  ).toBe("facts");
  expect(() => parseSemanticSummary("<campus-summary>incomplete")).toThrow();
  expect(() =>
    parseSemanticSummary("<campus-summary></campus-summary>"),
  ).toThrow();
});
test("semantic compaction sequentially summarizes chunks then merges, and propagates failure", async () => {
  const inputs: string[] = [],
    call = jest.fn(async (_system: string, input: string) => {
      inputs.push(input);
      return "<campus-summary>关键事实</campus-summary>";
    });
  const out = await summarizeTranscript("中".repeat(1500), call, 2000);
  expect(out).toBe("关键事实");
  expect(inputs).toHaveLength(4);
  expect(inputs[3]).toContain("按时间顺序");
  await expect(
    summarizeTranscript(
      "history",
      async () => {
        throw new Error("network");
      },
      256000,
    ),
  ).rejects.toThrow("network");
});
