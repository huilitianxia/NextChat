import { jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
const db = new Map<string, unknown>();
jest.unstable_mockModule("idb-keyval", () => ({
  get: async (key: string) => db.get(key),
  set: async (key: string, value: unknown) => {
    db.set(key, JSON.parse(JSON.stringify(value)));
  },
}));
const { activateIdentity, currentIdentity } = await import(
  "../app/utils/identity-storage"
);
const {
  filterKnowledge,
  knowledgeKey,
  listKnowledge,
  normalizeTags,
  saveKnowledge,
  removeKnowledge,
  updateKnowledge,
  validateNote,
} = await import("../app/utils/knowledge-vault");
const { mergeById, mergeMacros, planStudyMerge, validateStudyPayload } =
  await import("../app/utils/vault-merge");
Object.defineProperty(crypto, "randomUUID", {
  value: randomUUID,
  configurable: true,
});
const note = (id = "n", content = "formula") => ({
  id,
  title: "笔记",
  content,
  tags: ["模电"],
  createdAt: 1,
  updatedAt: 2,
});
const session = (id = "s", content = "answer") => ({
  id,
  topic: "实验",
  memoryPrompt: "",
  lastUpdate: 1,
  messages: [{ id: "m", role: "assistant", content, date: "2026" }],
});
const payload = (extra = {}) =>
  validateStudyPayload({
    format: "campus-study-data",
    version: 1,
    createdAt: "2026",
    sessions: [session()],
    notes: [note()],
    macros: [],
    appearance: { mode: "dark", palette: "blue" },
    ...extra,
  });
beforeEach(async () => {
  db.clear();
  await activateIdentity("capstone-a");
});
test("tags trimmed, deduplicated, split and bounded", () => {
  expect(normalizeTags(" #药理,#算法 药理；#有机")).toEqual([
    "药理",
    "算法",
    "有机",
  ]);
  expect(
    normalizeTags(Array.from({ length: 20 }, (_, i) => String(i))),
  ).toHaveLength(12);
});
test("note validation strips unknown fields and rejects bad content", () => {
  expect(validateNote({ ...note(), apiKey: "never" })).not.toHaveProperty(
    "apiKey",
  );
  expect(() => validateNote({ ...note(), content: " " })).toThrow();
  expect(() => validateNote({ ...note(), tags: [3] })).toThrow();
});
test("IndexedDB notes isolated across HMAC identity partitions and login required", async () => {
  await saveKnowledge({ title: "A", content: "private A", tags: ["算法"] });
  expect(await listKnowledge()).toHaveLength(1);
  expect([...db.keys()]).toEqual([knowledgeKey("capstone-a")]);
  await activateIdentity("capstone-b");
  expect(await listKnowledge()).toEqual([]);
  await saveKnowledge({ title: "B", content: "private B", tags: [] });
  await activateIdentity("capstone-a");
  expect((await listKnowledge())[0].content).toBe("private A");
  await activateIdentity("locked");
  await expect(listKnowledge()).rejects.toThrow(/登录/);
});
test("simultaneous clips serialize without dropping one", async () => {
  await Promise.all([
    saveKnowledge({ title: "One", content: "1", tags: [] }),
    saveKnowledge({ title: "Two", content: "2", tags: [] }),
  ]);
  expect(await listKnowledge()).toHaveLength(2);
});
test("edit preserves ID and creation time; remove only the selected note", async () => {
  const saved = await saveKnowledge({
      title: "One",
      content: "first",
      tags: [],
    }),
    original = saved[0];
  await saveKnowledge({
    id: original.id,
    title: "Updated",
    content: "second",
    tags: ["药理"],
  });
  const notes = await listKnowledge();
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({
    id: original.id,
    createdAt: original.createdAt,
    title: "Updated",
  });
  expect(await removeKnowledge(original.id)).toEqual([]);
});
test("failed update does not poison queue or lose previously saved records", async () => {
  await saveKnowledge({ title: "One", content: "1", tags: [] });
  await expect(
    updateKnowledge(() => {
      throw new Error("write cancelled");
    }),
  ).rejects.toThrow();
  await saveKnowledge({ title: "Two", content: "2", tags: [] });
  expect(await listKnowledge()).toHaveLength(2);
});
test("filter searches content and title and sorts by recency", () => {
  const a = note("a"),
    b = { ...note("b", "kinetics"), updatedAt: 8, tags: ["药理"] };
  expect(filterKnowledge([a, b], "药理", "KIN")).toEqual([b]);
  expect(filterKnowledge([a, b], "").map((n) => n.id)).toEqual(["b", "a"]);
});
test("portable whitelist excludes credentials, source identity and model configuration", () => {
  const data = payload({
    apiKey: "secret",
    identity: "owner",
    sessions: [
      {
        ...session(),
        mask: { modelConfig: { apiKey: "secret", model: "other" } },
        passwordHash: "secret",
      },
    ],
    appearance: { mode: "dark", palette: "paper", effort: "low" },
  });
  expect(JSON.stringify(data)).not.toMatch(/secret|owner|modelConfig|effort/);
  expect(data.appearance).toEqual({ mode: "dark", palette: "paper" });
});
test("messages retain useful source and image metadata without executable URL schemes", () => {
  const data = payload({
    sessions: [
      {
        ...session(),
        messages: [
          {
            ...session().messages[0],
            webSources: [
              { title: "site", url: "https://example.test" },
              { url: "javascript:alert(1)" },
            ],
            sources: [
              {
                id: "r",
                documentId: "d",
                name: "reading",
                text: "source",
                label: "P1",
                page: 1,
              },
            ],
            content: [
              { type: "text", text: "caption" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,YQ==" },
              },
            ],
          },
        ],
      },
    ],
  });
  expect(data.sessions[0].messages[0].webSources).toHaveLength(1);
  expect(data.sessions[0].messages[0].sources[0].page).toBe(1);
  expect(() =>
    payload({
      sessions: [
        {
          ...session(),
          messages: [
            {
              id: "m",
              role: "assistant",
              content: [
                {
                  type: "image_url",
                  image_url: { url: "javascript:alert(1)" },
                },
              ],
            },
          ],
        },
      ],
    }),
  ).toThrow();
});
test("duplicate session, note, message and macro IDs rejected", () => {
  expect(() => payload({ sessions: [session(), session()] })).toThrow();
  expect(() => payload({ notes: [note(), note()] })).toThrow();
  expect(() =>
    payload({
      sessions: [
        {
          ...session(),
          messages: [...session().messages, ...session().messages],
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    payload({
      macros: [
        { id: "a", name: "one", prompt: "x" },
        { id: "a", name: "two", prompt: "y" },
      ],
    }),
  ).toThrow();
});
test("same ID conflict creates deterministic copy and repeated import deduplicates", () => {
  const local = [note("n", "local")],
    incoming = [note("n", "remote")],
    first = mergeById(local, incoming);
  expect(first.items[0]).toEqual(local[0]);
  expect(first.added[0].id).toMatch(/^n-import-/);
  expect(first.conflicts).toBe(1);
  const repeat = mergeById(first.items, incoming);
  expect(repeat.added).toEqual([]);
  expect(repeat.skipped).toBe(1);
  expect(local).toHaveLength(1);
});
test("equal records differing only update timestamps are skipped", () =>
  expect(mergeById([note()], [{ ...note(), updatedAt: 500 }]).skipped).toBe(1));
test("malicious dictionary keys stay ordinary IDs and never affect prototypes", () => {
  const merged = mergeById([], [note("__proto__")]);
  expect(merged.mapping["__proto__"]).toBe("__proto__");
  expect(Object.getPrototypeOf(merged.mapping)).toBeNull();
});
test("merge limit errors before modifying source", () => {
  const local = [note("one")];
  expect(() => mergeById(local, [note("two")], 1)).toThrow();
  expect(local).toHaveLength(1);
});
test("import note source remaps to the imported conflict session and repeat remains stable", () => {
  const local = { sessions: [session("s", "local")], notes: [], macros: [] },
    incoming = payload({
      notes: [{ ...note(), source: { sessionId: "s", messageId: "m" } }],
    }),
    plan = planStudyMerge(local, incoming);
  expect(plan.notes.added[0].source?.sessionId).toBe(plan.sessions.added[0].id);
  const next = planStudyMerge(
    {
      sessions: plan.sessions.items,
      notes: plan.notes.items,
      macros: plan.macros.items,
    },
    incoming,
  );
  expect(next.notes.added).toHaveLength(0);
  expect(next.sessions.added).toHaveLength(0);
});
test("macro name/ID collisions retain local and rename import without duplicates", () => {
  const a = { id: "m", name: "学术", prompt: "local" },
    b = { ...a, prompt: "remote" },
    plan = mergeMacros([a], [b]);
  expect(plan.items[0]).toEqual(a);
  expect(plan.items[1].name).toBe("学术_导入");
  expect(mergeMacros(plan.items, [b]).items).toHaveLength(2);
});
test("a pre-existing import-copy ID is disambiguated instead of reused", () => {
  const local = { id: "m", name: "one", prompt: "local" },
    incoming = { ...local, prompt: "remote" },
    copy = mergeMacros([local], [incoming]).items[1];
  const result = mergeMacros(
    [local, { id: copy.id, name: "unrelated", prompt: "different" }],
    [incoming],
  );
  expect(new Set(result.items.map((m) => m.id)).size).toBe(3);
  expect(result.items[2].id).not.toBe(copy.id);
});
