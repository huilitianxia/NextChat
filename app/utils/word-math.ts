export async function latexToOmml(
  latex: string,
  display = false,
): Promise<string | null> {
  if (typeof window === "undefined") throw new Error("请在浏览器中导出 Word。");
  if (!latex.trim() || latex.length > 12000) return null;
  try {
    const [{ default: katex }, { mml2omml }] = await Promise.all([
      import("katex"),
      import("mathml2omml"),
    ]);
    const rendered = katex.renderToString(latex, {
      output: "mathml",
      displayMode: display,
      throwOnError: true,
      trust: false,
      strict: "error",
      maxExpand: 1000,
      maxSize: 20,
    });
    const mathml = rendered
      .match(/<math\b[\s\S]*?<\/math>/)?.[0]
      ?.replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/g, "");
    if (!mathml) return null;
    const omml = mml2omml(mathml);
    const xml = new DOMParser().parseFromString(omml, "application/xml");
    if (
      xml.querySelector("parsererror") ||
      xml.documentElement.localName !== "oMath" ||
      !xml.getElementsByTagNameNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/math",
        "t",
      ).length
    )
      return null;
    // The converter can leave bare operator text beside runs (e.g. sum i + sqrt x).
    // OMML requires runs; mixed text also makes docx's XML importer lose siblings.
    const mathNS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
    const walker = xml.createTreeWalker(
      xml.documentElement,
      NodeFilter.SHOW_TEXT,
    );
    const bare: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (
        node.textContent?.trim() &&
        parent?.namespaceURI === mathNS &&
        parent.localName !== "t"
      )
        bare.push(node);
    }
    for (const node of bare) {
      const run = xml.createElementNS(mathNS, "m:r"),
        text = xml.createElementNS(mathNS, "m:t");
      text.setAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "xml:space",
        "preserve",
      );
      text.textContent = node.textContent;
      run.appendChild(text);
      node.parentNode!.replaceChild(run, node);
    }
    const normalized = new XMLSerializer().serializeToString(
      xml.documentElement,
    );
    return display
      ? `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${normalized}</m:oMathPara>`
      : normalized;
  } catch {
    return null;
  }
}
export function normalizeMathDelimiters(markdown: string) {
  return markdown
    .split(/(`{3,}[^]*?`{3,}|~{3,}[^]*?~{3,}|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(
              /\\\[([\s\S]*?)\\\]/g,
              (_match, math) => `\n$$\n${math}\n$$\n`,
            )
            .replace(/\\\(([^\n]*?)\\\)/g, (_match, math) => `$${math}$`),
    )
    .join("");
}
