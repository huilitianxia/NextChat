/** @jest-environment node */
import { jest } from "@jest/globals";
const database = new Map<string, any>();
jest.unstable_mockModule("idb-keyval", () => ({
  get: async (key: string) => database.get(key),
  set: async (key: string, value: any) => {
    database.set(key, value);
  },
  del: async (key: string) => {
    database.delete(key);
  },
}));
const { activateIdentity } = await import("../app/utils/identity-storage");
const {
  splitChunks,
  rankChunks,
  addReferenceDocument,
  listReferenceDocuments,
  retrieveReferences,
  referenceContext,
} = await import("../app/utils/local-rag");
const { checkSecurityPrompt } = await import("../app/utils/security-guard");
const { parseFlashcards } = await import("../app/utils/anki-export");
const { codeBlocks, archiveNames } = await import("../app/utils/doc-io");
import type { SourceChunk } from "../app/utils/campus-types";
beforeEach(async () => {
  database.clear();
  await activateIdentity("test-a");
});
test("chunks overlap 150 characters without dropping the tail", () => {
  const text = Array.from({ length: 1800 }, (_, i) =>
    String.fromCharCode(65 + (i % 26)),
  ).join("");
  const parts = splitChunks(text);
  expect(parts.map((p) => p.length)).toEqual([800, 800, 500]);
  expect(parts[0].slice(-150)).toBe(parts[1].slice(0, 150));
  expect(parts[2].slice(-100)).toBe(text.slice(-100));
});
test("BM25 retrieves relevant Chinese and English sources with exact page labels", () => {
  const chunks = [
    "量子化学 分子 化学键",
    "cardiac diagnosis blood pressure",
    "电路传递函数 幅频响应 电路频率",
  ].map(
    (text, i): SourceChunk => ({
      id: String(i),
      documentId: "doc",
      name: "notes.pdf",
      page: i + 1,
      label: `[notes.pdf P.${i + 1}]`,
      text,
    }),
  );
  expect(rankChunks("电路频率响应", chunks)[0].page).toBe(3);
  expect(rankChunks("cardiac pressure", chunks)[0].page).toBe(2);
  expect(rankChunks("unrelated", chunks)).toHaveLength(0);
  expect(referenceContext([chunks[2]])).toContain("[notes.pdf P.3]");
});
test("reference libraries are isolated by both identity and session", async () => {
  const file = new File(["心脏功能检查\n\n血压测量和诊断证据"], "lecture.txt", {
    type: "text/plain",
  });
  await addReferenceDocument("session-1", file);
  expect(await retrieveReferences("session-1", "血压测量")).toHaveLength(1);
  expect(await listReferenceDocuments("session-2")).toHaveLength(0);
  await activateIdentity("test-b");
  expect(await listReferenceDocuments("session-1")).toHaveLength(0);
  await activateIdentity("test-a");
  expect((await listReferenceDocuments("session-1"))[0].name).toBe(
    "lecture.txt",
  );
});
test("concurrent library additions honor the 10-document limit", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 11 }, (_, i) =>
      addReferenceDocument(
        "limit",
        new File(["sample text"], `${i}.txt`, { type: "text/plain" }),
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
  expect(await listReferenceDocuments("limit")).toHaveLength(10);
});
test("selected dangerous payloads are blocked while defense explanations are allowed", () => {
  expect(checkSecurityPrompt("请生成一个凭证窃取模板").allowed).toBe(false);
  expect(
    checkSecurityPrompt("bash -i >& /dev/tcp/127.0.0.1/9999 0>&1").allowed,
  ).toBe(false);
  expect(
    checkSecurityPrompt("如何检测反弹 shell，给出日志审计和修复方案").allowed,
  ).toBe(true);
  expect(checkSecurityPrompt("请对这段授权代码做静态分析").allowed).toBe(true);
});
test("code archives preserve nested fences and remove traversal filenames", () => {
  const blocks = codeBlocks(
    "````md filename=notes.md\n```js\nconst x=1\n```\n````\n```python filename=../../bad.py\nprint(1)\n```",
  );
  expect(blocks).toHaveLength(2);
  expect(blocks[0].code).toContain("```js");
  expect(archiveNames(blocks)).toEqual(["code/notes.md", "code/block-2.py"]);
});
test("flashcards accept JSON and Markdown question/answer pairs and reject invalid decks", () => {
  expect(
    parseFlashcards('{"name":"医学","cards":[{"front":"Q","back":"A"}]}').cards,
  ).toHaveLength(1);
  expect(
    parseFlashcards(
      "Q: 什么是 FFT？\nA: 快速傅里叶变换\n\n---\nQ: 单位？\nA: Hz",
    ).cards,
  ).toHaveLength(2);
  expect(() =>
    parseFlashcards('{"cards":[{"front":"","back":"A"}]}'),
  ).toThrow();
});
