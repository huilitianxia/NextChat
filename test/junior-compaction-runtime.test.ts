import { jest } from "@jest/globals";
import type { ChatOptions } from "../app/client/api";
let currentId = "s";
const makeSession = () =>
  ({
    id: "s",
    contextWindow: 256000,
    memoryPrompt: "",
    mask: { modelConfig: { model: "gpt-6.2-sol", reasoningEffort: "xhigh" } },
    messages: Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? "assistant" : "user",
      content: "必须保存的公式与实验结论。".repeat(50),
      date: "",
    })),
  }) as any;
let session = makeSession();
const store = {
  get sessions() {
    return [session];
  },
  currentSession: () => ({ id: currentId }),
  updateTargetSession: (_s: any, update: (s: any) => void) => update(session),
};
let handler: (options: ChatOptions) => Promise<void> = async () => {};
jest.unstable_mockModule("@/app/store/chat", () => ({
  useChatStore: { getState: () => store },
}));
jest.unstable_mockModule("@/app/client/api", () => ({
  getClientApi: () => ({
    llm: { chat: (options: ChatOptions) => handler(options) },
  }),
}));
const { activateIdentity } = await import("../app/utils/identity-storage");
const { useContextOperations } = await import(
  "../app/store/context-operations"
);
const { semanticCompaction } = await import("../app/utils/context-runtime");
beforeEach(async () => {
  await activateIdentity("summary-owner");
  session = makeSession();
  currentId = "s";
  useContextOperations.setState({
    sessionId: null,
    progress: "",
    cancel: null,
  });
});
test("semantic preview uses locked model and low per-call effort without changing user's effort or history", async () => {
  let sent: ChatOptions | undefined;
  handler = async (options) => {
    sent = options;
    options.onFinish?.(
      "<campus-summary>关键实验结论与公式。</campus-summary>",
      { ok: true, status: 200 } as Response,
    );
  };
  const original = JSON.stringify(session),
    r = await semanticCompaction("s");
  expect(sent?.config).toMatchObject({
    model: "gpt-6.2-sol",
    reasoningEffort: "low",
    webSearch: false,
    stream: true,
  });
  expect(r.text).toBe("关键实验结论与公式。");
  expect(JSON.stringify(session)).toBe(original);
  expect(useContextOperations.getState().sessionId).toBeNull();
});
test("apply writes only validated summary metadata and leaves last three turns and originals untouched", async () => {
  handler = async (options) => {
    options.onFinish?.("<campus-summary>简短关键事实。</campus-summary>", {
      ok: true,
      status: 200,
    } as Response);
  };
  const before = JSON.stringify(session.messages);
  await semanticCompaction("s", true);
  expect(session.contextSummary.method).toBe("ai");
  expect(session.contextSummary.throughId).toBe("m5");
  expect(JSON.stringify(session.messages)).toBe(before);
  expect(session.mask.modelConfig.reasoningEffort).toBe("xhigh");
});
test("network failure preserves existing context and releases busy state", async () => {
  handler = async (options) => {
    options.onError?.(new Error("mock network failure"));
  };
  await expect(semanticCompaction("s", true)).rejects.toThrow(
    "mock network failure",
  );
  expect(session.contextSummary).toBeUndefined();
  expect(useContextOperations.getState().sessionId).toBeNull();
});
test("prefix edit while summary is in flight rejects stale application", async () => {
  handler = async (options) => {
    session.messages[0].content = "changed source";
    options.onFinish?.("<campus-summary>旧摘要。</campus-summary>", {
      ok: true,
      status: 200,
    } as Response);
  };
  await expect(semanticCompaction("s", true)).rejects.toThrow(/变化/);
  expect(session.contextSummary).toBeUndefined();
});
test("session switch and identity switch cancel result application", async () => {
  handler = async (options) => {
    currentId = "other";
    options.onFinish?.("<campus-summary>摘要。</campus-summary>", {
      ok: true,
      status: 200,
    } as Response);
  };
  await expect(semanticCompaction("s", true)).rejects.toThrow(/取消/);
  expect(session.contextSummary).toBeUndefined();
  currentId = "s";
  handler = async (options) => {
    await activateIdentity("other-owner");
    options.onFinish?.("<campus-summary>摘要。</campus-summary>", {
      ok: true,
      status: 200,
    } as Response);
  };
  await expect(semanticCompaction("s", true)).rejects.toThrow(/取消/);
  expect(session.contextSummary).toBeUndefined();
});
test("manual cancellation aborts the existing transport controller", async () => {
  const controller = new AbortController();
  handler = async (options) => {
    options.onController?.(controller);
    useContextOperations.getState().cancel?.();
  };
  await expect(semanticCompaction("s", true)).rejects.toThrow(/取消/);
  expect(controller.signal.aborted).toBe(true);
  expect(session.contextSummary).toBeUndefined();
});
test("parallel summary requests are blocked", async () => {
  useContextOperations.setState({ sessionId: "active" });
  await expect(semanticCompaction("s")).rejects.toThrow(/已有/);
});
