const mathSymbols: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  theta: "θ",
  pi: "π",
  omega: "ω",
  Delta: "Δ",
  sum: "Σ",
  int: "∫",
  infty: "∞",
  times: "×",
  cdot: "·",
  pm: "±",
  leq: "≤",
  geq: "≥",
  neq: "≠",
  to: "→",
  rightarrow: "→",
};
export function cleanAcademicText(markdown: string) {
  let fence = "";
  const prose = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length &&
          !marker[2].trim()
        )
          fence = "";
        return false;
      }
      if (marker) {
        fence = marker[1];
        return false;
      }
      return true;
    })
    .join("\n");
  let text = prose
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ");
  for (let i = 0; i < 5; i++)
    text = text
      .replace(/\\(?:d?frac)\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
      .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, "$1");
  text = text
    .replace(/\\(?:begin|end)\{[^}]*\}/g, " ")
    .replace(/\\([a-zA-Z]+)/g, (_, name) => mathSymbols[name] || " ")
    .replace(/\\[()[\]]|\$|[{}^_]/g, "")
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-+*]\s+(?:\[[ x]\]\s*)?|\d+[.)]\s+)/gm, "")
    .replace(/^[\s|:-]+$/gm, " ")
    .replace(/[`*~|]/g, "")
    .replace(
      /&(?:amp|lt|gt|quot|apos);/g,
      (value) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
        })[value]!,
    );
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .normalize("NFC");
}
export function textTokens(text: string) {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(
        /[\p{Script=Han}]|(?:(?!\p{Script=Han})[\p{L}\p{N}])+(?:['’](?:(?!\p{Script=Han})[\p{L}\p{N}])+)*/gu,
      ) || []
  );
}
export function cleanCounts(markdown: string) {
  const text = cleanAcademicText(markdown);
  return {
    text,
    characters: Array.from(text.replace(/\s/gu, "")).length,
    words: textTokens(text).length,
  };
}
export function ngrams(tokens: string[], n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error("N 必须为 1–8。");
  if (!tokens.length) return new Set<string>();
  if (tokens.length < n) return new Set([JSON.stringify(tokens)]);
  return new Set(
    Array.from({ length: tokens.length - n + 1 }, (_, i) =>
      JSON.stringify(tokens.slice(i, i + n)),
    ),
  );
}
export function similarityMetrics(before: string, after: string, n = 3) {
  if (before.length + after.length > 200000) throw new Error("自检内容过长。");
  const original = cleanCounts(before),
    revised = cleanCounts(after),
    a = ngrams(textTokens(original.text), n),
    b = ngrams(textTokens(revised.text), n),
    intersection = [...a].filter((gram) => b.has(gram)).length,
    union = new Set([...a, ...b]).size;
  return {
    original,
    revised,
    n,
    intersection,
    union,
    similarity: union ? (intersection / union) * 100 : null,
  };
}
export function sentenceRanges(text: string) {
  const result: { text: string; start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      decimal =
        c === "." &&
        /\d/.test(text[i - 1] || "") &&
        /\d/.test(text[i + 1] || "");
    if (
      /[。！？!?\n]/.test(c) ||
      (c === "." && !decimal) ||
      i === text.length - 1
    ) {
      let end = i + 1;
      while (/[”’"')\]]/.test(text[end] || "\0")) end++;
      const raw = text.slice(start, end),
        leading = raw.length - raw.trimStart().length,
        trailing = raw.length - raw.trimEnd().length;
      if (raw.trim())
        result.push({
          text: raw.trim(),
          start: start + leading,
          end: end - trailing,
        });
      start = end;
      i = end - 1;
    }
  }
  return result;
}
