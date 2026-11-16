import LZString from "lz-string";
import { encodeShare, decodeShare, shareUrl } from "../app/utils/share-codec";
import {
  parseReference,
  formatCitation,
  citationMissing,
  EMPTY_CITATION,
} from "../app/utils/citation-formatter";
test("fragment share roundtrips Unicode, equations and code", () => {
  const content = "# 你好 🧪\n$E=mc^2$\n```js\nconsole.log('x')\n```";
  expect(decodeShare(encodeShare(content, "课程笔记"))).toEqual({
    version: 1,
    title: "课程笔记",
    content,
  });
  const url = new URL(
    shareUrl("https://campus.test/?private=old#/chat", content),
  );
  expect(url.search).toBe("");
  expect(url.hash.startsWith("#share=")).toBe(true);
  expect(url.pathname).toBe("/");
  const withoutCredentials = new URL(
    shareUrl("https://user:password@campus.test/", content),
  );
  expect(withoutCredentials.username).toBe("");
  expect(withoutCredentials.password).toBe("");
});
test.each([
  "",
  "bad%",
  "x".repeat(12001),
  LZString.compressToEncodedURIComponent(
    JSON.stringify({ version: 2, title: "x", content: "test" }),
  ),
  LZString.compressToEncodedURIComponent(
    JSON.stringify({ version: 1, title: "x", content: 23 }),
  ),
])("invalid share fails safely %#", (value) =>
  expect(() => decodeShare(value)).toThrow(),
);
test("sharing contains only title/body/version and never arbitrary fields", () => {
  const raw = LZString.compressToEncodedURIComponent(
    JSON.stringify({
      version: 1,
      title: "x",
      content: "text",
      apiKey: "do-not-import",
      role: "system",
    }),
  );
  expect(decodeShare(raw)).toEqual({ version: 1, title: "x", content: "text" });
  expect(() => encodeShare(" ")).toThrow();
  expect(() => encodeShare("x".repeat(60001))).toThrow();
});
test("DOI/arxiv parsing normalizes identifiers without inventing metadata", () => {
  const doi = parseReference("https://doi.org/10.1000/example");
  expect(doi.doi).toBe("10.1000/example");
  expect(doi.title).toBe("");
  expect(citationMissing(doi)).toContain("作者");
  expect(
    parseReference("https://arxiv.org/pdf/2301.01234v2.pdf"),
  ).toMatchObject({ type: "preprint", arxiv: "2301.01234v2" });
  expect(parseReference("arXiv:hep-th/9901001").arxiv).toBe("hep-th/9901001");
});
const c = {
  ...EMPTY_CITATION,
  authors: ["Smith, Jane", "Doe, John"],
  title: "Circuit analysis",
  year: "2024",
  journal: "Journal of Circuits",
  volume: "12",
  issue: "2",
  pages: "10-19",
  doi: "10.1000/example",
};
test("formats a complete APA journal citation", () => {
  expect(formatCitation(c, "apa")).toBe(
    "Smith, J., & Doe, J. (2024). Circuit analysis. Journal of Circuits, 12(2), 10–19. https://doi.org/10.1000/example",
  );
});
test("formats IEEE initial names and fields", () => {
  expect(formatCitation(c, "ieee")).toBe(
    "[1] J. Smith and J. Doe, “Circuit analysis,” Journal of Circuits, vol. 12, no. 2, pp. 10-19, 2024. doi: 10.1000/example.",
  );
});
test("formats requested GB/T 7714-2015 fields", () => {
  expect(formatCitation(c, "gb")).toBe(
    "SMITH J, DOE J. Circuit analysis[J]. Journal of Circuits, 2024, 12(2): 10-19. DOI: 10.1000/example.",
  );
});
test("BibTeX escapes content and uses proper author separators", () => {
  const bib = formatCitation({ ...c, title: "A & B_{x} 10%" }, "bib");
  expect(bib).toContain("author = {Smith, Jane and Doe, John}");
  expect(bib).toContain("A \\& B\\_\\{x\\} 10\\%");
  expect(bib).toContain("pages = {10--19}");
  expect(bib).toContain("@article{Smith2024");
});
test("raw fields and JSON are parsed without unsafe URL schemes", () => {
  const fields = parseReference(
    "作者: 李明; 王芳\n标题: 电路研究\n年份: 2023\n期刊: 电气学报\nurl: javascript:alert(1)",
  );
  expect(fields.authors).toEqual(["李明", "王芳"]);
  expect(fields.url).toBe("");
  expect(formatCitation(fields, "gb")).toContain(
    "李明, 王芳. 电路研究[J]. 电气学报, 2023.",
  );
  expect(parseReference(JSON.stringify(c)).title).toBe(c.title);
});
test("incomplete references cannot be silently formatted", () => {
  expect(() => formatCitation(parseReference("10.1000/x"), "apa")).toThrow(
    "请补充",
  );
});
test("book and preprint outputs keep document type", () => {
  expect(
    formatCitation(
      { ...c, type: "book", publisher: "Academic Press", place: "北京" },
      "gb",
    ),
  ).toContain("[M]. 北京: Academic Press, 2024.");
  expect(
    formatCitation(
      {
        ...c,
        type: "preprint",
        arxiv: "2401.01234",
        doi: "",
        url: "https://arxiv.org/abs/2401.01234",
      },
      "bib",
    ),
  ).toContain("archivePrefix = {arXiv}");
});
