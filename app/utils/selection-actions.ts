export const SELECTION_ACTIONS = [
  "深入解释",
  "学术润色",
  "中英互译",
  "制作为 Anki 卡片",
] as const;
export function selectionPrompt(action: string, excerpt: string) {
  const quote = excerpt.trim().slice(0, 12000);
  if (!quote || !SELECTION_ACTIONS.includes(action as any)) return "";
  const instruction: Record<string, string> = {
    深入解释:
      "请深入解释下面选中的片段，补充必要背景、推导或例子，明确不确定处。",
    学术润色:
      "请将下面选中的片段润色为清晰、准确的学术表述，保留原意和数据，不添加虚构结论。",
    中英互译:
      "请准确翻译下面选中的片段：中文译为英文，英文译为中文；保留术语、公式和原意。",
    "制作为 Anki 卡片":
      '请把下面选中的概念整理成准确、简洁的复习卡，并用 anki 代码块输出 JSON：{"name":"划词复习","cards":[{"front":"问题","back":"答案"}]}。',
  };
  return `${instruction[action]}\n\n以下是待处理的引用内容：\n${quote
    .split("\n")
    .map((line) => "> " + line)
    .join("\n")}`;
}
