export type PromptMacro = { id: string; name: string; prompt: string };
export const DEFAULT_MACROS: PromptMacro[] = [
  {
    id: "polish",
    name: "润色",
    prompt:
      "请在保留原意和事实的前提下，对以下文字进行学术润色，随后说明主要修改：\n",
  },
  {
    id: "rewrite",
    name: "降重",
    prompt:
      "请帮助我独立重述以下观点，保留必要引用，不改变事实；指出需要注明来源的内容：\n",
  },
  {
    id: "review",
    name: "代码审查",
    prompt:
      "请审查以下代码，重点检查正确性、边界条件、安全性及可维护性，并给出具体修改建议：\n",
  },
  {
    id: "comment",
    name: "逐行注释",
    prompt:
      "请逐行解释以下代码的作用、输入输出和关键假设，并添加清晰的中文注释：\n",
  },
];
export function validateMacros(value: unknown): PromptMacro[] {
  if (!Array.isArray(value) || value.length > 60)
    throw new Error("最多保存 60 条指令。");
  const names = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item.name !== "string" ||
      !/^[\p{L}\p{N}_-]{1,24}$/u.test(item.name) ||
      typeof item.prompt !== "string" ||
      !item.prompt.trim() ||
      item.prompt.length > 12000 ||
      names.has(item.name.toLowerCase())
    )
      throw new Error("指令名称须唯一且不含空格，内容不能为空。");
    names.add(item.name.toLowerCase());
    return {
      id: String(item.id || item.name),
      name: item.name,
      prompt: item.prompt,
    };
  });
}
export function matchSlash(input: string, macros: PromptMacro[]) {
  const match = /^\/([^\s/]{0,24})$/u.exec(input);
  if (!match) return [];
  const term = match[1].toLowerCase();
  return macros
    .filter((macro) => macro.name.toLowerCase().includes(term))
    .sort(
      (a, b) =>
        Number(b.name.startsWith(term)) - Number(a.name.startsWith(term)),
    )
    .slice(0, 8);
}
