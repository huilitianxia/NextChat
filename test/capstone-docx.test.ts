import {
  cheatSheetMarkdown,
  examSheetBlob,
  EXAM_LAYOUT,
  knowledgeDeck,
} from "../app/utils/exam-cheatsheet";
import JSZip from "jszip";
import { TextDecoder, TextEncoder } from "node:util";
Object.assign(globalThis, { TextDecoder, TextEncoder });
const notes = [
  {
    id: "a",
    title: "模电复习",
    content:
      "电压关系 $U=IR$。\n\n$$\\frac{1}{2}x^2$$\n\n| A | B |\n|---|---|\n| 1 | 2 |",
    tags: ["模电"],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "b",
    title: "有机复习",
    content: "- 亲核取代\n- 记录条件\n\n```text\nrate = k * c\n```",
    tags: ["有机"],
    createdAt: 1,
    updatedAt: 1,
  },
];
const bytes = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = reject;
    r.readAsArrayBuffer(blob);
  });
test("combined notes retain order, course tags, math and card boundaries", () => {
  const md = cheatSheetMarkdown(notes);
  expect(md).toContain("#模电");
  expect(md.indexOf("模电复习")).toBeLessThan(md.indexOf("有机复习"));
  expect(md).toContain("$U=IR$");
  expect(knowledgeDeck(notes)).toEqual({
    name: "知识手账",
    cards: [
      { front: "模电复习 · 模电", back: notes[0].content },
      { front: "有机复习 · 有机", back: notes[1].content },
    ],
  });
});
test("export selection and size limits enforced", () => {
  expect(() => cheatSheetMarkdown([])).toThrow();
  expect(() => knowledgeDeck(Array(301).fill(notes[0]))).toThrow();
  expect(() =>
    cheatSheetMarkdown([{ ...notes[0], content: "x".repeat(1000001) }]),
  ).toThrow();
});
test("actual DOCX has A4, two columns, 10mm margins, compact type, native math and table cells", async () => {
  const zip = await JSZip.loadAsync(await bytes(await examSheetBlob(notes))),
    xml = await zip.file("word/document.xml")!.async("text"),
    style = await zip.file("word/styles.xml")!.async("text");
  const document = new DOMParser().parseFromString(xml, "application/xml"),
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    find = (name: string) => document.getElementsByTagNameNS(ns, name)[0],
    attr = (node: Element, name: string) => node.getAttributeNS(ns, name);
  expect(attr(find("pgSz"), "w")).toBe("11906");
  expect(attr(find("pgSz"), "h")).toBe("16838");
  for (const side of ["top", "bottom", "left", "right"])
    expect(attr(find("pgMar"), side)).toBe("567");
  expect(attr(find("cols"), "num")).toBe("2");
  expect(attr(find("cols"), "space")).toBe("360");
  expect(EXAM_LAYOUT.fontSize).toBe(17);
  expect(style).toContain('w:val="17"');
  expect(xml).toContain("m:oMath");
  expect(xml).toContain("<w:tbl>");
  expect(xml).toContain("模电复习");
  expect(xml).toContain("有机复习");
  expect(xml).toContain("rate = k * c");
  expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
}, 30000);
