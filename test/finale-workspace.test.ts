import {
  DEFAULT_MACROS,
  matchSlash,
  validateMacros,
} from "../app/utils/slash-commands";
import { useFinale } from "../app/store/finale";
import {
  activateIdentity,
  identityStorageKey,
} from "../app/utils/identity-storage";
import {
  branchMessages,
  compactText,
  compactionSlice,
} from "../app/utils/conversation-tools";
import { matchedPdfItems } from "../app/utils/pdf-highlight";
test("slash matcher only triggers at a standalone slash command", () => {
  expect(matchSlash("/", DEFAULT_MACROS)).toHaveLength(4);
  expect(matchSlash("/润", DEFAULT_MACROS).map((m) => m.name)).toEqual([
    "润色",
  ]);
  expect(matchSlash("http://x", DEFAULT_MACROS)).toEqual([]);
  expect(matchSlash("/润色 内容", DEFAULT_MACROS)).toEqual([]);
  expect(matchSlash("text /", DEFAULT_MACROS)).toEqual([]);
});
test("macro validation rejects duplicates and malformed commands", () => {
  expect(() =>
    validateMacros([{ id: "x", name: "/bad", prompt: "x" }]),
  ).toThrow();
  expect(() =>
    validateMacros([
      { id: "a", name: "x", prompt: "hi" },
      { id: "b", name: "X", prompt: "there" },
    ]),
  ).toThrow();
  expect(() =>
    validateMacros([{ id: "x", name: "test", prompt: " " }]),
  ).toThrow();
});
test("personal macros restore separately per identity; shared UI resets", async () => {
  await activateIdentity("finale-a");
  useFinale
    .getState()
    .saveMacros([{ id: "custom", name: "实验", prompt: "本用户的实验模板" }]);
  useFinale.getState().open("toolbox");
  useFinale.getState().toggleZen();
  expect(localStorage.getItem(identityStorageKey("prompt-macros"))).toContain(
    "实验",
  );
  await activateIdentity("finale-b");
  expect(useFinale.getState().macros).toEqual(DEFAULT_MACROS);
  expect(useFinale.getState()).toMatchObject({
    tool: null,
    zen: false,
    pdf: null,
  });
  await activateIdentity("finale-a");
  expect(useFinale.getState().macros[0].name).toBe("实验");
  await activateIdentity("locked");
  expect(() => useFinale.getState().saveMacros(DEFAULT_MACROS)).toThrow();
});
const messages = Array.from({ length: 12 }, (_, i) => ({
  id: String(i),
  date: "today",
  role: i % 2 ? "assistant" : "user",
  content: `第 ${i} 条完整内容`,
  streaming: false,
})) as any;
test("branch deep clones only the chosen prefix and generates unique IDs", () => {
  const branch = branchMessages(messages, "3");
  expect(branch).toHaveLength(4);
  expect(branch.map((m) => m.content)).toEqual(
    messages.slice(0, 4).map((m: any) => m.content),
  );
  expect(branch[0].id).not.toBe(messages[0].id);
  branch[0].content = "changed";
  expect(messages[0].content).not.toBe("changed");
  expect(() => branchMessages(messages, "missing")).toThrow();
});
test("compaction preserves recent complete turns and labels extractive context", () => {
  const slice = compactionSlice({ messages } as any);
  expect(slice.earlier).toHaveLength(8);
  expect(slice.recent[0].role).toBe("user");
  const summary = compactText(slice.earlier);
  expect(summary).toContain("本地摘录");
  expect(summary).toContain("第 0 条完整内容");
  expect(summary).not.toContain("第 11 条完整内容");
  expect(
    compactText([{ role: "user", content: "x".repeat(2000) }], 400).length,
  ).toBeLessThanOrEqual(400);
  expect(() =>
    compactionSlice({ messages: messages.slice(0, 8) } as any),
  ).toThrow();
});
test("PDF chunk highlighting maps normalized text across item boundaries", () => {
  expect(
    matchedPdfItems(
      ["Intro", "The voltage ", "is 12 V", "Other"],
      "The voltage is 12 V",
    ),
  ).toEqual([1, 2]);
  expect(matchedPdfItems(["中", "文公式", "的解释"], "中文公式")).toEqual([
    0, 1,
  ]);
  expect(matchedPdfItems(["alpha"], "missing")).toEqual([]);
});
