function escapedAt(text: string, position: number) {
  let slash = position - 1;
  while (slash >= 0 && text[slash] === "\\") slash--;
  return (position - slash - 1) % 2 !== 0;
}

function escapeCurrency(text: string) {
  const dollars = Array.from(text.matchAll(/\$+/g))
    .filter(
      (match) => match[0].length === 1 && !escapedAt(text, match.index ?? 0),
    )
    .map((match) => match.index ?? 0);
  let start = 0;
  let output = "";
  for (let i = 0; i < dollars.length; i++) {
    const here = dollars[i];
    const next = dollars[i + 1] ?? text.length;
    const between = text.slice(here + 1, next);
    const amount = /^-?\d+(?:[.,]\d+)*/.exec(between);
    const prose =
      amount &&
      /^[\s,，.;；:：-]+(?:[a-z]{2,}\b|\p{Script=Han})/iu.test(
        between.slice(amount[0].length),
      );
    const math =
      next < text.length &&
      between.trim() &&
      !/[\r\n]/.test(between) &&
      !/\d/.test(text.charAt(next + 1)) &&
      !prose;
    if (math) {
      i++;
    } else if (amount) {
      output += text.slice(start, here) + "\\$";
      start = here + 1;
    }
  }
  return output + text.slice(start);
}

export function normalizeMarkdownMath(markdown: string) {
  const protectedSpans =
    /^[ \t]{0,3}(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?(?:^[ \t]{0,3}\1[`~]*[ \t]*(?=\r?$)|(?![\s\S]))|(`+)(?!`)[\s\S]*?\2(?!`)|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$[\s\S]*?\$\$(?!\$)/gm;
  let start = 0;
  let output = "";
  for (const match of markdown.matchAll(protectedSpans)) {
    if (escapedAt(markdown, match.index ?? 0)) continue;
    output += escapeCurrency(markdown.slice(start, match.index));
    if (match[3] !== undefined) {
      output += "\n\n$$\n" + match[3].trim() + "\n$$\n\n";
    } else if (match[4] !== undefined) {
      output += "$" + match[4].trim().replace(/\r?\n/g, " ") + "$";
    } else {
      output += match[0];
    }
    start = (match.index ?? 0) + match[0].length;
  }
  return output + escapeCurrency(markdown.slice(start));
}
