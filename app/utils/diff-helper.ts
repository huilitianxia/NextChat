import { diffWordsWithSpace, diffLines, diffChars } from "diff";
import { codeBlocks } from "./doc-io";
export type DiffPart = { value: string; added?: boolean; removed?: boolean };
export function revisionPair(prompt: string, answer: string) {
  const before = codeBlocks(prompt),
    after = codeBlocks(answer);
  if (before.length)
    return {
      before: before.map((b) => b.code).join("\n\n"),
      after: after.length
        ? after.map((b) => b.code).join("\n\n")
        : answer.trim(),
      code: true,
    };
  const quoted =
    prompt.match(/(?:原文|原稿|待修改|文本)\s*[:：]\s*([\s\S]+)/)?.[1] ||
    prompt.match(/[“「]([\s\S]{10,})[”」]/)?.[1];
  const text =
    quoted ||
    prompt.replace(
      /^(?:请)?(?:帮我)?(?:润色|改写|修改|翻译|降重|校对|优化)[^\n:：]*[:：\n]\s*/,
      "",
    );
  return { before: text.trim(), after: answer.trim(), code: false };
}
export function compareRevision(
  before: string,
  after: string,
  lines = false,
): DiffPart[] {
  if (before.length + after.length > 100000)
    throw new Error("对照内容过长，请选取 50,000 字以内的片段。");
  const options = { timeout: 150, maxEditLength: 12000 };
  const result = lines
    ? diffLines(before, after, options)
    : /\p{Script=Han}/u.test(before + after)
    ? diffChars(before, after, options)
    : diffWordsWithSpace(before, after, options);
  if (!result) throw new Error("差异过大，请缩小比较范围。");
  return result.map(({ value, added, removed }) => ({ value, added, removed }));
}
