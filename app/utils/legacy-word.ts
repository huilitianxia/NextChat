const CONVERSION_ADVICE =
  "此 DOC 文本格式暂不支持或内容已损坏，请用 Word 或 WPS 另存为 DOCX 或 PDF 后重试。";
const WORD_NAMESPACES = new Set([
  "http://schemas.microsoft.com/office/word/2003/wordml",
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
]);

function unsupported(): never {
  throw new Error(CONVERSION_ADVICE);
}

function finishMarkup(parts: string[]) {
  return parts
    .join("")
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]*\t/g, "\t")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractWordXml(text: string) {
  // Word XML does not need DTDs or custom entities. Do not resolve external data.
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) unsupported();
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const root = xml.documentElement;
  if (
    xml.getElementsByTagName("parsererror").length ||
    !WORD_NAMESPACES.has(root.namespaceURI ?? "") ||
    !["wordDocument", "document"].includes(root.localName)
  )
    unsupported();
  const parts: string[] = [];
  const stack: Array<{ element: Element; close?: boolean }> = [
    { element: root },
  ];
  while (stack.length) {
    const { element, close } = stack.pop()!;
    const isWord = WORD_NAMESPACES.has(element.namespaceURI ?? "");
    const name = element.localName;
    if (close) {
      if (isWord && name === "tc") parts.push("\t");
      else if (isWord && ["p", "tr"].includes(name)) parts.push("\n");
      continue;
    }
    if (isWord && name === "t") {
      parts.push(element.textContent ?? "");
      continue;
    }
    if (isWord && ["instrText", "delText", "binData"].includes(name)) continue;
    if (isWord && name === "tab") parts.push("\t");
    if (isWord && ["br", "cr"].includes(name)) parts.push("\n");
    stack.push({ element, close: true });
    for (let i = element.children.length - 1; i >= 0; i--) {
      stack.push({ element: element.children[i] });
    }
  }
  const result = finishMarkup(parts);
  if (!result) unsupported();
  return result;
}

function extractWordHtml(text: string) {
  // A detached template has inert contents: scripts do not run and images,
  // frames and stylesheets are never connected or fetched for extraction.
  const template = document.createElement("template");
  template.innerHTML = text;
  const ignored = new Set([
    "SCRIPT",
    "STYLE",
    "HEAD",
    "TITLE",
    "NOSCRIPT",
    "TEMPLATE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "SVG",
    "MATH",
    "LINK",
    "META",
    "BASE",
  ]);
  const blocks = new Set([
    "P",
    "DIV",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "SECTION",
    "ARTICLE",
    "HEADER",
    "FOOTER",
    "MAIN",
    "ADDRESS",
    "BLOCKQUOTE",
    "PRE",
    "LI",
    "TR",
    "TABLE",
  ]);
  const parts: string[] = [];
  const stack: Array<{ node: Node; close?: boolean; pre?: boolean }> = [
    { node: template.content },
  ];
  while (stack.length) {
    const { node, close, pre } = stack.pop()!;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = pre
        ? node.textContent ?? ""
        : (node.textContent ?? "").replace(/\s+/g, " ");
      if (value === " " && (!parts.length || /[\n\t]$/.test(parts.at(-1)!)))
        continue;
      parts.push(value);
      continue;
    }
    if (
      node.nodeType !== Node.ELEMENT_NODE &&
      node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    )
      continue;
    const element =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
    const tag = element?.tagName.toUpperCase() ?? "";
    if (close) {
      if (["TD", "TH"].includes(tag)) parts.push("\t");
      else if (blocks.has(tag)) parts.push("\n");
      continue;
    }
    if (
      ignored.has(tag) ||
      element?.hasAttribute("hidden") ||
      element?.getAttribute("aria-hidden") === "true"
    )
      continue;
    if (["BR", "HR"].includes(tag)) parts.push("\n");
    if (
      blocks.has(tag) &&
      tag !== "TR" &&
      parts.length &&
      !/[\n\t]$/.test(parts.at(-1)!)
    )
      parts.push("\n");
    stack.push({ node, close: true });
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      stack.push({ node: node.childNodes[i], pre: pre || tag === "PRE" });
    }
  }
  const result = finishMarkup(parts);
  if (!result) unsupported();
  return result;
}

type RtfState = {
  skip: boolean;
  hidden: boolean;
  uc: number;
  codePage: number;
  fontTable?: boolean;
  fontId?: number;
  uprChild?: number;
  uprBranch?: number;
  awaitingUnicode?: boolean;
  unicodeStar?: boolean;
};
const RTF_DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "pict",
  "object",
  "objdata",
  "datastore",
  "themedata",
  "colorschememapping",
  "listtable",
  "listoverridetable",
  "rsidtbl",
  "xmlnstbl",
  "filetbl",
  "revtbl",
  "generator",
  "docvar",
  "fldinst",
]);
const RTF_SYMBOLS: Record<string, string> = {
  par: "\n",
  line: "\n",
  row: "\n",
  nestrow: "\n",
  cell: "\t",
  nestcell: "\t",
  tab: "\t",
  page: "\n\n",
  sect: "\n\n",
  emdash: "—",
  endash: "–",
  bullet: "•",
  lquote: "‘",
  rquote: "’",
  ldblquote: "“",
  rdblquote: "”",
  emspace: "\u2003",
  enspace: "\u2002",
  qmspace: " ",
  "~": "\u00a0",
  _: "\u2011",
  "-": "",
};

function extractRtf(text: string) {
  const stack: RtfState[] = [];
  let state: RtfState = { skip: false, hidden: false, uc: 1, codePage: 1252 };
  const parts: string[] = [];
  let bytes: number[] = [];
  let fallback = 0;
  let rootClosed = false;
  let sawHeader = false;
  let defaultFont: number | undefined;
  const fontCodePages = new Map<number, number>();
  const explicitFontCodePages = new Set<number>();
  const append = (value: string) => {
    if (!state.skip && !state.hidden) parts.push(value);
  };
  const flushBytes = () => {
    if (!bytes.length) return;
    const labels: Record<number, string> = {
      936: "gbk",
      1252: "windows-1252",
      65001: "utf-8",
    };
    const fontId = state.fontId ?? defaultFont;
    const codePage =
      fontId === undefined
        ? state.codePage
        : fontCodePages.get(fontId) ?? state.codePage;
    const label = labels[codePage];
    if (!label) unsupported();
    try {
      append(
        new TextDecoder(label, { fatal: true }).decode(new Uint8Array(bytes)),
      );
    } catch {
      unsupported();
    }
    bytes = [];
  };

  for (let i = 0; i < text.length; ) {
    const char = text[i++];
    if (rootClosed) {
      if (!/\s/.test(char)) unsupported();
      else continue;
    }
    if (char === "\r" || char === "\n") continue;
    if (char === "{") {
      flushBytes();
      fallback = 0;
      if (stack.length >= 256) unsupported();
      if (state.awaitingUnicode) unsupported();
      const branch =
        state.uprChild === undefined ? undefined : ++state.uprChild;
      if (branch !== undefined && branch > 2) unsupported();
      stack.push(state);
      state = {
        ...state,
        uprChild: undefined,
        uprBranch: branch,
        awaitingUnicode: branch === 2,
        unicodeStar: false,
        skip: state.skip || branch === 1,
      };
      continue;
    }
    if (char === "}") {
      flushBytes();
      fallback = 0;
      if (!stack.length) unsupported();
      if (state.awaitingUnicode || state.uprChild !== undefined) unsupported();
      const completedUnicodeAlternative = state.uprBranch === 2;
      state = stack.pop()!;
      if (completedUnicodeAlternative) state.uprChild = undefined;
      if (!stack.length) rootClosed = true;
      continue;
    }
    if (!stack.length) unsupported();
    if (char !== "\\") {
      if (state.awaitingUnicode) unsupported();
      flushBytes();
      if (fallback > 0) fallback--;
      else append(char);
      continue;
    }
    if (i >= text.length) unsupported();
    const control = text[i++];
    if (control === "'") {
      const hex = text.slice(i, i + 2);
      if (!/^[0-9a-f]{2}$/i.test(hex)) unsupported();
      i += 2;
      if (fallback > 0) fallback--;
      else if (!state.skip && !state.hidden) bytes.push(parseInt(hex, 16));
      continue;
    }
    flushBytes();
    if (control === "\\" || control === "{" || control === "}") {
      if (fallback > 0) fallback--;
      else append(control);
      continue;
    }
    if (!/[a-z]/i.test(control)) {
      if (control === "*" && state.awaitingUnicode) state.unicodeStar = true;
      else if (control === "*") state.skip = true;
      else if (fallback > 0) fallback--;
      else if (Object.prototype.hasOwnProperty.call(RTF_SYMBOLS, control))
        append(RTF_SYMBOLS[control]);
      continue;
    }
    const start = i - 1;
    while (i < text.length && /[a-z]/i.test(text[i])) i++;
    const word = text.slice(start, i).toLowerCase();
    let negative = false;
    if (text[i] === "-") {
      negative = true;
      i++;
    }
    const numberStart = i;
    while (i < text.length && /[0-9]/.test(text[i])) i++;
    if (i - numberStart > 10) unsupported();
    const number =
      i > numberStart
        ? Number(text.slice(numberStart, i)) * (negative ? -1 : 1)
        : undefined;
    if (negative && number === undefined) unsupported();
    if (text[i] === " ") i++;
    if (state.awaitingUnicode) {
      if (word !== "ud" || !state.unicodeStar) unsupported();
      state.awaitingUnicode = false;
      state.unicodeStar = false;
      continue;
    }
    if (word === "bin") {
      if (number === undefined || number < 0 || number > text.length - i)
        unsupported();
      i += number;
      if (fallback > 0) fallback--;
      continue;
    }
    if (fallback > 0) {
      fallback--;
      continue;
    }
    if (word === "rtf") {
      if (number !== 1 || sawHeader) unsupported();
      sawHeader = true;
    } else if (word === "upr" && !state.skip) {
      if (state.uprChild !== undefined) unsupported();
      state.uprChild = 0;
    } else if (word === "fonttbl") {
      state.fontTable = true;
      state.skip = true;
    } else if (RTF_DESTINATIONS.has(word)) state.skip = true;
    else if (word === "deff") {
      if (number === undefined || number < 0) unsupported();
      defaultFont = number;
    } else if (word === "f") {
      if (number === undefined || number < 0) unsupported();
      state.fontId = number;
    } else if (word === "plain") {
      state.fontId = defaultFont;
      state.hidden = false;
    } else if (word === "fcharset" && state.fontTable) {
      if (state.fontId === undefined || number === undefined) unsupported();
      // ANSI/default fonts inherit ansicpg; explicit font codepages take priority.
      if (!explicitFontCodePages.has(state.fontId)) {
        if (number === 0 || number === 1) fontCodePages.delete(state.fontId);
        else fontCodePages.set(state.fontId, number === 134 ? 936 : -1);
      }
    } else if (word === "ansicpg" || word === "cpg") {
      if (number === undefined || number <= 0) unsupported();
      if (word === "cpg" && state.fontTable) {
        if (state.fontId === undefined) unsupported();
        fontCodePages.set(state.fontId, number);
        explicitFontCodePages.add(state.fontId);
      } else state.codePage = number;
    } else if (word === "uc") {
      if (number === undefined || number < 0 || number > 1024) unsupported();
      state.uc = number;
    } else if (word === "u") {
      if (number === undefined || number < -32768 || number > 65535)
        unsupported();
      append(String.fromCharCode(number < 0 ? number + 65536 : number));
      fallback = state.uc;
    } else if (word === "v") state.hidden = number !== 0;
    else if (Object.prototype.hasOwnProperty.call(RTF_SYMBOLS, word))
      append(RTF_SYMBOLS[word]);
  }
  if (!sawHeader || !rootClosed || stack.length) unsupported();
  const result = finishMarkup(parts);
  if (!result) unsupported();
  return result;
}

/** Extract decoded textual DOC variants only. Binary format detection belongs to the caller. */
export function extractLegacyWordText(text: string): string {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (/^\{\\rtf/i.test(trimmed)) return extractRtf(trimmed);
  let signature = trimmed;
  let hasLeadingComment = false;
  while (signature.startsWith("<!--")) {
    const end = signature.indexOf("-->", 4);
    if (end < 0) unsupported();
    hasLeadingComment = true;
    signature = signature.slice(end + 3).trimStart();
  }
  if (hasLeadingComment && !signature) unsupported();
  if (
    /^(?:<\?xml\b|<\?mso-application\b|<(?:\w+:)?(?:wordDocument|document)\b)/i.test(
      signature,
    )
  ) {
    // XHTML/XML declarations are common in HTML saved by Word as well.
    if (/<html(?:\s|>)/i.test(trimmed)) return extractWordHtml(trimmed);
    return extractWordXml(trimmed);
  }
  if (
    /^(?:<!doctype\s+html\b|<(?:html|head|body|meta|div|p|table|h[1-6]|span|br)(?:\s|>|\/))/i.test(
      signature,
    )
  ) {
    return extractWordHtml(trimmed);
  }
  if (/^<[\w:!?][^>]*>/.test(signature)) unsupported();
  if (hasLeadingComment) return extractWordHtml(trimmed);
  return text;
}
