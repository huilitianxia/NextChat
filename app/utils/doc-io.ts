import type { AttachmentTextBuffer } from "./attachment-policy";

export type CodeBlock = { language: string; code: string; meta: string };
export function codeBlocks(markdown: string): CodeBlock[] {
  const result: CodeBlock[] = [];
  let active: {
    fence: string;
    language: string;
    meta: string;
    lines: string[];
  } | null = null;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (!active) {
      const match = /^ {0,3}(`{3,}|~{3,})([^\s`~]*)(.*)$/.exec(line);
      if (match)
        active = {
          fence: match[1],
          language: match[2].toLowerCase(),
          meta: match[3].trim(),
          lines: [],
        };
    } else if (
      new RegExp(
        `^ {0,3}${active.fence[0]}{${active.fence.length},}\\s*$`,
      ).test(line)
    ) {
      result.push({
        language: active.language,
        meta: active.meta,
        code: active.lines.join("\n"),
      });
      active = null;
    } else active.lines.push(line);
  }
  return result;
}
export const hasTables = (markdown: string) =>
  /^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(markdown) ||
  codeBlocks(markdown).some((b) => b.language === "csv");
export async function saveFile(blob: Blob, name: string) {
  const fileSaver = await import("file-saver");
  // FileSaver's UMD package is exposed differently by native ESM and Webpack.
  const save =
    fileSaver.saveAs || (fileSaver.default as any)?.saveAs || fileSaver.default;
  const filename = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 150);
  if (typeof save === "function") save(blob, filename);
  else {
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
export async function markdownTree(
  markdown: string,
  math = false,
): Promise<any> {
  // Sequential linking also works with Jest's VM modules sharing micromark deps.
  const { unified } = await import("unified");
  const { default: parse } = await import("remark-parse");
  const { default: gfm } = await import("remark-gfm");
  const processor = unified().use(parse).use(gfm);
  if (math) processor.use((await import("remark-math")).default);
  return processor.parse(markdown);
}
function plain(node: any): string {
  return node.value ?? (node.children ?? []).map(plain).join("");
}
export async function wordBlob(
  markdown: string,
  title = "NextChat 学习笔记",
  compact?: {
    width: number;
    height: number;
    margin: number;
    columns: number;
    columnGap: number;
    fontSize: number;
    line: number;
  },
) {
  if (typeof window === "undefined") throw new Error("请在浏览器中导出 Word。");
  const d = await import("docx");
  const { latexToOmml, normalizeMathDelimiters } = await import("./word-math");
  const tree = await markdownTree(normalizeMathDelimiters(markdown), true);
  const equations = new Map<any, string | null>();
  async function convert(node: any): Promise<void> {
    if (node.type === "math" || node.type === "inlineMath")
      equations.set(node, await latexToOmml(node.value, node.type === "math"));
    for (const child of node.children || []) await convert(child);
  }
  await convert(tree);
  function runs(
    node: any,
    format: { bold?: boolean; italics?: boolean } = {},
  ): import("docx").ParagraphChild[] {
    if (equations.has(node)) {
      const xml = equations.get(node);
      // Imported XML is serializable here; docx's child union omits the generic component.
      return [
        xml
          ? (d.ImportedXmlComponent.fromXmlString(
              xml,
            ) as unknown as import("docx").ParagraphChild)
          : new d.TextRun({ text: `[公式：${node.value}]`, ...format }),
      ];
    }
    if (node.type === "break") return [new d.TextRun({ break: 1 })];
    if (node.value !== undefined)
      return [
        new d.TextRun({
          text: node.value,
          ...format,
          ...(node.type === "inlineCode"
            ? { font: "Consolas", shading: { fill: "EFF3F5" } }
            : {}),
        }),
      ];
    const next = {
      ...format,
      ...(node.type === "strong" ? { bold: true } : {}),
      ...(node.type === "emphasis" ? { italics: true } : {}),
    };
    return (node.children ?? []).flatMap((child: any) => runs(child, next));
  }
  const border = { style: d.BorderStyle.SINGLE, size: 4, color: "CBD5DF" };
  function blocks(
    nodes: any[],
    level = 0,
  ): Array<InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>> {
    return nodes.flatMap((node): any[] => {
      if (node.type === "table")
        return [
          new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            rows: node.children.map(
              (row: any, index: number) =>
                new d.TableRow({
                  tableHeader: index === 0,
                  children: row.children.map(
                    (cell: any) =>
                      new d.TableCell({
                        margins: {
                          top: compact ? 30 : 100,
                          bottom: compact ? 30 : 100,
                          left: compact ? 50 : 130,
                          right: compact ? 50 : 130,
                        },
                        borders: {
                          top: border,
                          bottom: border,
                          left: border,
                          right: border,
                        },
                        shading: index === 0 ? { fill: "E8F2EF" } : undefined,
                        children: [
                          new d.Paragraph({
                            children: runs(cell, { bold: index === 0 }),
                            spacing: { after: 80 },
                          }),
                        ],
                      }),
                  ),
                }),
            ),
          }),
        ];
      if (node.type === "list")
        return node.children.flatMap((item: any) =>
          item.children.flatMap((child: any, index: number) =>
            child.type === "list"
              ? blocks([child], Math.min(level + 1, 8))
              : [
                  new d.Paragraph({
                    children: runs(child),
                    ...(index === 0
                      ? node.ordered
                        ? {
                            numbering: { reference: "campus-numbering", level },
                          }
                        : { bullet: { level } }
                      : {}),
                    spacing: { after: compact ? 30 : 100 },
                  }),
                ],
          ),
        );
      if (node.type === "code")
        return node.value.split("\n").map(
          (text: string) =>
            new d.Paragraph({
              children: [
                new d.TextRun({
                  text: text || " ",
                  font: "Consolas",
                  size: compact ? 15 : 19,
                }),
              ],
              shading: { fill: "F1F4F7" },
              spacing: { before: 0, after: 0, line: compact ? 220 : 270 },
              indent: { left: 150, right: 150 },
            }),
        );
      if (node.type === "blockquote")
        return [
          new d.Paragraph({
            children: runs(node),
            border: {
              left: { ...border, size: 14, color: "28736A", space: 8 },
            },
            indent: { left: 280 },
            spacing: { after: 180 },
          }),
        ];
      if (node.type === "thematicBreak")
        return [new d.Paragraph({ border: { bottom: border }, text: "" })];
      return [
        new d.Paragraph({
          children:
            compact && node.type === "heading"
              ? [
                  new d.TextRun({
                    text: plain(node),
                    bold: true,
                    color: "000000",
                    size: node.depth === 1 ? 23 : 19,
                  }),
                ]
              : runs(node),
          ...(node.type === "heading"
            ? {
                heading: [
                  d.HeadingLevel.HEADING_1,
                  d.HeadingLevel.HEADING_2,
                  d.HeadingLevel.HEADING_3,
                ][Math.min(node.depth, 3) - 1],
              }
            : {}),
          spacing: {
            after: compact ? 45 : 160,
            line: compact ? compact.line : 330,
          },
          ...(compact && node.type === "heading" ? { keepNext: true } : {}),
        }),
      ];
    });
  }
  return d.Packer.toBlob(
    new d.Document({
      creator: "NextChat",
      title,
      styles: {
        default: {
          document: {
            run: { font: "等线", size: compact ? compact.fontSize : 22 },
            paragraph: { spacing: { line: compact ? compact.line : 330 } },
          },
        },
      },
      numbering: {
        config: [
          {
            reference: "campus-numbering",
            levels: Array.from({ length: 9 }, (_, level) => ({
              level,
              format: d.LevelFormat.DECIMAL,
              text: `%${level + 1}.`,
              alignment: d.AlignmentType.START,
              style: {
                paragraph: {
                  indent: {
                    left: (compact ? 240 : 720) * (level + 1),
                    hanging: compact ? 180 : 260,
                  },
                },
              },
            })),
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: compact
                ? {
                    top: compact.margin,
                    right: compact.margin,
                    bottom: compact.margin,
                    left: compact.margin,
                  }
                : { top: 1134, right: 1134, bottom: 1134, left: 1134 },
              ...(compact
                ? { size: { width: compact.width, height: compact.height } }
                : {}),
            },
            ...(compact
              ? {
                  column: {
                    count: compact.columns,
                    space: compact.columnGap,
                    equalWidth: true,
                  },
                }
              : {}),
          },
          children: blocks(tree.children),
        },
      ],
    }),
  );
}
export async function spreadsheetText(
  data: ArrayBuffer | string,
  text: AttachmentTextBuffer,
  signal?: AbortSignal,
) {
  const XLSX = await import("xlsx");
  signal?.throwIfAborted();
  const workbook = XLSX.read(data, {
    type: typeof data === "string" ? "string" : "array",
    dense: false,
    cellFormula: false,
    cellHTML: false,
    raw: true,
  });
  for (const name of workbook.SheetNames) {
    signal?.throwIfAborted();
    const sheet = workbook.Sheets[name];
    const ref = sheet?.["!ref"];
    if (!ref) continue;
    const { s, e } = XLSX.utils.decode_range(ref);
    // Traverse populated cells only. A faraway cell can create a huge !ref.
    const cells = Object.keys(sheet)
      .flatMap((address) => {
        if (!/^[A-Z]{1,3}[1-9]\d*$/.test(address) || sheet[address]?.v == null)
          return [];
        const { r, c } = XLSX.utils.decode_cell(address);
        if (r < s.r || r > e.r || c < s.c || c > e.c) return [];
        return [{ address, r, c }];
      })
      .sort((a, b) => a.r - b.r || a.c - b.c);
    let row = -1;
    let column = s.c;
    for (const { address, r, c } of cells) {
      const value = XLSX.utils
        .format_cell(sheet[address])
        .replace(/[\t\r\n]+/g, " ");
      if (!value.trim()) continue;
      if (row < 0) {
        if (text.characterCount) text.append("\n\n");
        text.append(`[工作表：${name}]\n`);
      } else if (r !== row) text.append("\n");

      const gap = c - (r === row ? column : s.c);
      if (r === row) text.append("\t");
      // Keep ordinary TSV alignment and label widely separated cells explicitly.
      text.append(`${gap > 32 ? `[${address}] ` : "\t".repeat(gap)}${value}`);
      row = r;
      column = c + 1;
    }
  }
  if (!text.characterCount) throw new Error("工作簿没有可读取的单元格。");
}
export async function excelBlob(markdown: string) {
  const XLSX = await import("xlsx");
  const tree = await markdownTree(markdown);
  const matrices: string[][][] = [];
  const walk = (node: any) => {
    if (node.type === "table")
      matrices.push(node.children.map((row: any) => row.children.map(plain)));
    else (node.children ?? []).forEach(walk);
  };
  walk(tree);
  for (const code of codeBlocks(markdown).filter(
    (block) => block.language === "csv",
  )) {
    const parsed = XLSX.read(code.code, {
      type: "string",
      raw: true,
      cellFormula: false,
    });
    matrices.push(
      XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], {
        header: 1,
        defval: "",
        blankrows: false,
      }),
    );
  }
  if (!matrices.length)
    throw new Error("这条回复中没有可导出的表格或 CSV 代码块。");
  const book = XLSX.utils.book_new();
  matrices.forEach((rows, index) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = Array.from(
      { length: Math.max(...rows.map((row) => row.length), 1) },
      (_, col) => ({
        wch: Math.min(
          55,
          Math.max(
            14,
            ...rows.map((row) => String(row[col] ?? "").length * 1.3 + 3),
          ),
        ),
      }),
    );
    sheet["!rows"] = [{ hpt: 28 }];
    if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
    XLSX.utils.book_append_sheet(book, sheet, `表格${index + 1}`);
  });
  // CE writes data/widths; add portable OOXML header styling and frozen header rows.
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(
    XLSX.write(book, { type: "array", bookType: "xlsx" }),
  );
  const styles = await zip.file("xl/styles.xml")!.async("string");
  const fontIndex = Number(/<fonts count="(\d+)"/.exec(styles)?.[1] || 1);
  const fillIndex = Number(/<fills count="(\d+)"/.exec(styles)?.[1] || 2);
  const styleIndex = Number(/<cellXfs count="(\d+)"/.exec(styles)?.[1] || 1);
  zip.file(
    "xl/styles.xml",
    styles
      .replace(/<fonts count="\d+"/, `<fonts count="${fontIndex + 1}"`)
      .replace(
        "</fonts>",
        '<font><b/><sz val="11"/><color rgb="FF234B46"/><name val="Calibri"/></font></fonts>',
      )
      .replace(/<fills count="\d+"/, `<fills count="${fillIndex + 1}"`)
      .replace(
        "</fills>",
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F2EF"/><bgColor indexed="64"/></patternFill></fill></fills>',
      )
      .replace(/<cellXfs count="\d+"/, `<cellXfs count="${styleIndex + 1}"`)
      .replace(
        "</cellXfs>",
        `<xf numFmtId="0" fontId="${fontIndex}" fillId="${fillIndex}" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>`,
      ),
  );
  for (const entry of Object.values(zip.files).filter((file) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name),
  )) {
    let xml = await entry.async("string");
    xml = xml.replace(
      /(<row\b[^>]*r="1"[^>]*>)([\s\S]*?)(<\/row>)/,
      (_, a, body, c) =>
        a +
        body.replace(
          /<c\b([^>]*)>/g,
          (_m: string, attrs: string) =>
            `<c${attrs.replace(/\s+s="[^"]*"/, "")} s="${styleIndex}">`,
        ) +
        c,
    );
    xml = xml.replace(
      /(<sheetView\b[^>]*)(\/)>/,
      '$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>',
    );
    zip.file(entry.name, xml);
  }
  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}
export function archiveNames(blocks: CodeBlock[]) {
  const extensions: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    bash: "sh",
    shell: "sh",
    csharp: "cs",
    cpp: "cpp",
    yaml: "yml",
    plaintext: "txt",
  };
  const seen = new Set<string>();
  return blocks.map((block, index) => {
    const provided =
      /(?:^|\s)(?:file(?:name)?=)?["']?([\w./-]+\.[a-zA-Z0-9]+)["']?/.exec(
        block.meta,
      )?.[1];
    const safe =
      provided &&
      !provided.split(/[\\/]/).some((part) => part === "..") &&
      !provided.startsWith("/")
        ? provided
        : `block-${index + 1}.${
            extensions[block.language] ||
            (/^[a-z0-9]{1,10}$/.test(block.language) ? block.language : "txt")
          }`;
    let name = `code/${safe}`;
    if (seen.has(name)) name = `code/${index + 1}-${safe.replaceAll("/", "-")}`;
    seen.add(name);
    return name;
  });
}
export async function codeZipBlob(markdown: string) {
  const { default: JSZip } = await import("jszip");
  const blocks = codeBlocks(markdown),
    names = archiveNames(blocks);
  if (blocks.length < 2) throw new Error("需要至少两个完整代码块才能打包。");
  const zip = new JSZip();
  blocks.forEach((block, index) => zip.file(names[index], block.code));
  zip.file(
    "README.md",
    `# NextChat 代码导出\n\n${names
      .map((name) => `- ${name}`)
      .join("\n")}\n\n代码来自对话，运行前请自行审查依赖和内容。\n`,
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
