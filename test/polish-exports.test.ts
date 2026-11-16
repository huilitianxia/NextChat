import {
  detectSlides,
  parseSlides,
  paginateSlides,
  presentationBlob,
} from "../app/utils/slides";
import { latexToOmml, normalizeMathDelimiters } from "../app/utils/word-math";
import { wordBlob } from "../app/utils/doc-io";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { TextEncoder, TextDecoder } from "node:util";
Object.assign(globalThis, { TextEncoder, TextDecoder });
Object.assign(window, { PptxGenJS });
const blobBytes = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
const deck = {
  title: "电路分析",
  slides: [
    {
      title: "频率响应",
      subtitle: "课堂汇报",
      bullets: ["核对单位", "解释相位"],
      notes: "讲解截止频率并指出实验误差。",
      layout: "two-column",
    },
  ],
};
test("slides detection accepts JSON and headed Markdown slides, not ordinary separators or malformed data", () => {
  expect(
    detectSlides("```slides\n" + JSON.stringify(deck) + "\n```")?.slides[0]
      .notes,
  ).toContain("截止频率");
  expect(
    detectSlides("# 第一页\n- A\n---\n# 第二页\n- B\n备注：解释B")?.slides,
  ).toHaveLength(2);
  expect(detectSlides("paragraph\n---\nparagraph")).toBeNull();
  expect(detectSlides("```slides\n{broken\n```")).toBeNull();
  expect(() =>
    parseSlides({ slides: [{ title: "title", bullets: [3] }] }),
  ).toThrow();
});
test("long slide content paginates without losing bullet text or speaker notes", () => {
  const text = "这是一段需要完整保留的研究结论。".repeat(65);
  const parsed = parseSlides({
    slides: [{ title: "研究", bullets: [text], notes: "备注保留" }],
  });
  const result = paginateSlides(parsed);
  expect(result.slides.length).toBeGreaterThan(1);
  expect(result.slides.flatMap((slide) => slide.bullets).join("")).toBe(text);
  expect(result.slides.every((slide) => slide.notes === "备注保留")).toBe(true);
});
test.each(["academic", "tech"] as const)(
  "%s export is a real PPTX with editable text and speaker notes",
  async (theme) => {
    const blob = await presentationBlob(parseSlides(deck), theme);
    const zip = await JSZip.loadAsync(await blobBytes(blob));
    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
    expect(slide).toContain("<a:t>频率响应</a:t>");
    expect(slide).toContain("<p:sp>");
    expect(slide).not.toContain("<p:pic>");
    expect(slide).toContain(theme === "tech" ? "0D1A2C" : "FFFFFF");
    expect(
      await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string"),
    ).toContain("讲解截止频率");
  },
);
test("real LaTeX conversion creates fractions, powers, roots and matrices as native OMML", async () => {
  expect(await latexToOmml("\\frac{a^2}{\\sqrt{b}}", true)).toMatch(/<m:f>/);
  expect(
    await latexToOmml("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}"),
  ).toContain("<m:m>");
  expect(await latexToOmml("\\unknownexotic{a}")).toBeNull();
});
test("DOCX math works in paragraphs, display math, lists and tables; invalid macros preserve text", async () => {
  const blob = await wordBlob(
    "# 公式笔记\n\n行内 $E=mc^2$。\n\n$$\n\\frac{1}{2}\\sum_{i=1}^n i\n$$\n\n- 根式 $\\sqrt{x}$\n\n| 项目 | 公式 |\n| --- | --- |\n| 电压 | $U=IR$ |\n\n$\\unknownexotic{x}$\n\n```txt\n$not_math$\n```",
  );
  const zip = await JSZip.loadAsync(await blobBytes(blob));
  const xml = await zip.file("word/document.xml")!.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  expect(
    doc.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/math",
      "oMath",
    ).length,
  ).toBe(4);
  expect(xml).toContain("m:oMathPara");
  expect(xml).toContain("[公式：\\unknownexotic{x}]");
  expect(xml).toContain("$not_math$");
});
test("app math delimiters convert without interpreting code examples", () => {
  expect(normalizeMathDelimiters("\\(x^2\\) `\\(code\\)`")).toBe(
    "$x^2$ `\\(code\\)`",
  );
});
test("sum operands and adjacent operators survive native Word serialization", async () => {
  const blob = await wordBlob(
    "$$\n\\frac{1}{2}\\sum_{i=1}^n i + \\sqrt{x}\n$$",
  );
  const zip = await JSZip.loadAsync(await blobBytes(blob));
  const xml = new DOMParser().parseFromString(
    await zip.file("word/document.xml")!.async("string"),
    "application/xml",
  );
  const ns = "http://schemas.openxmlformats.org/officeDocument/2006/math";
  const nary = xml.getElementsByTagNameNS(ns, "nary")[0];
  const operand = Array.from(nary.children).find(
    (child) => child.localName === "e",
  )!;
  expect(operand.textContent).toBe("i+");
  expect(
    Array.from(operand.childNodes).every((node) => node.nodeType === 1),
  ).toBe(true);
});
