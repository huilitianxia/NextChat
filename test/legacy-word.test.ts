/** @jest-environment jsdom */

import { TextDecoder as NodeTextDecoder } from "node:util";
import { jest } from "@jest/globals";
import { extractLegacyWordText } from "../app/utils/legacy-word";

const originalDecoder = Object.getOwnPropertyDescriptor(
  globalThis,
  "TextDecoder",
);
beforeAll(() =>
  Object.defineProperty(globalThis, "TextDecoder", {
    configurable: true,
    value: NodeTextDecoder,
  }),
);
afterAll(() => {
  if (originalDecoder)
    Object.defineProperty(globalThis, "TextDecoder", originalDecoder);
  else Reflect.deleteProperty(globalThis, "TextDecoder");
});
afterEach(() => jest.restoreAllMocks());

test("plain decoded text passes through without trimming or reformatting", () => {
  const text = "  老王的文档\r\n\r\n第一段 < 第二段\t代码示例\n";
  expect(extractLegacyWordText(text)).toBe(text);
});

test("Word 2003 XML preserves paragraph and table boundaries, not markup or properties", () => {
  const xml = `<?xml version="1.0"?>
  <w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml">
    <w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一段</w:t></w:r></w:p>
      <w:p><w:r><w:t>第二段</w:t><w:tab/><w:t>制表</w:t><w:br/><w:t>换行</w:t></w:r></w:p>
      <w:tbl><w:tr>
        <w:tc><w:p><w:r><w:t>商品</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>价格</w:t></w:r></w:p></w:tc>
      </w:tr><w:tr>
        <w:tc><w:p><w:r><w:t>便利贴</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>12 &amp; 20</w:t></w:r></w:p></w:tc>
      </w:tr></w:tbl>
    </w:body>
  </w:wordDocument>`;
  expect(extractLegacyWordText(xml)).toBe(
    "第一段\n第二段\t制表\n换行\n商品\t价格\n便利贴\t12 & 20",
  );
});

test("Word XML accepts another namespace prefix and excludes deleted/field-instruction text", () => {
  const xml = `<wordDocument xmlns="http://schemas.microsoft.com/office/word/2003/wordml"><body><p><r><instrText>SECRET FIELD</instrText><delText>已删除</delText><t>实际内容</t></r></p></body></wordDocument>`;
  expect(extractLegacyWordText(xml)).toBe("实际内容");
});

test("HTML DOC extraction is inert and preserves paragraphs, cells and entities", () => {
  const before = document.body.innerHTML;
  const fetchSpy = jest.spyOn(globalThis, "fetch");
  const attachSpy = jest.spyOn(document.body, "appendChild");
  const html = `<!DOCTYPE html><html><head><title>不要提取</title>
    <link rel="stylesheet" href="https://not-requested.example/style.css"/>
    <style>p{color:red}</style></head><body>
    <script>window.__legacyExecuted = true</script>
    <p>第一段 <b>重点</b> &amp; 内容<br>下一行</p>
    <img src="https://not-requested.example/image.jpg" onerror="window.__legacyExecuted=true">
    <iframe src="https://not-requested.example/frame">不提取框架</iframe>
    <p hidden>隐藏内容</p>
    <table><tr><td><p>姓名</p></td><td><p>年龄</p></td></tr>
      <tr><td>老王</td><td>30</td></tr></table>
    </body></html>`;
  const result = extractLegacyWordText(html);
  expect(result).toBe("第一段 重点 & 内容\n下一行\n姓名\t年龄\n老王\t30");
  expect(document.body.innerHTML).toBe(before);
  expect(attachSpy).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(
    (window as unknown as { __legacyExecuted?: boolean }).__legacyExecuted,
  ).toBeUndefined();
});

test("HTML fragments keep spaces between inline runs and text-only table structure", () => {
  expect(
    extractLegacyWordText(
      "<div><span>Hello</span> <strong>world</strong></div><p>结束</p>",
    ),
  ).toBe("Hello world\n结束");
});

test("HTML DOC files may begin with export comments without exposing them as text", () => {
  expect(
    extractLegacyWordText(
      "<!-- exported by Word -->\n<!-- second note --><html><body><p>正文</p></body></html>",
    ),
  ).toBe("正文");
  expect(() =>
    extractLegacyWordText("<!-- unfinished comment<html><p>正文</p></html>"),
  ).toThrow("另存为 DOCX 或 PDF");
});

test("RTF supports paragraphs, table rows and escaped syntax while excluding metadata", () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg1252{\fonttbl{\f0 Arial;}}{\info{\title Hidden metadata}}第一段\par 第二段\line 下一行\par 姓名\cell 年龄\cell\row 老王\cell 30\cell\row \{原文\} \\ 路径{\*\unknown 不要提取}{\pict 010203}}`;
  expect(extractLegacyWordText(rtf)).toBe(
    "第一段\n第二段\n下一行\n姓名\t年龄\n老王\t30\n{原文} \\ 路径",
  );
});

test("RTF decodes contiguous codepage 936 hex bytes as Chinese", () => {
  expect(
    extractLegacyWordText(
      String.raw`{\rtf1\ansi\ansicpg936 \'c4\'e3\'ba\'c3\par \'d6\'d0\'ce\'c4}`,
    ),
  ).toBe("你好\n中文");
});

test("RTF decodes Windows-1252 quotes, euro and accented Latin characters", () => {
  expect(
    extractLegacyWordText(
      String.raw`{\rtf1\ansi\ansicpg1252 \'93Caf\'e9\'94 \'80}`,
    ),
  ).toBe("“Café” €");
});

test("RTF font charset 134 overrides default ANSI and restores the previous font after a group", () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fcharset134 SimSun;}{\f1\fcharset0 Arial;}}\'c4\'e3 {\f1 \'93Latin\'94} \'ba\'c3}`;
  expect(extractLegacyWordText(rtf)).toBe("你 “Latin” 好");
});

test("explicit RTF font codepage overrides charset regardless of their order", () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg1252{\fonttbl{\f0\cpg936\fcharset0 SimSun;}{\f1\fcharset134\cpg1252 Arial;}}\f0 \'c4\'e3\'ba\'c3\par\f1 Caf\'e9}`;
  expect(extractLegacyWordText(rtf)).toBe("你好\nCafé");
});

test("RTF Unicode alternative prefers ud and excludes the lossy ANSI duplicate", () => {
  const rtf = String.raw`{\rtf1\ansi before {\upr{??}{\*\ud{\uc0\u20320\u22909}}} after {\upr{old}{\*\ud New}}}`;
  expect(extractLegacyWordText(rtf)).toBe("before 你好 after New");
});

test("RTF Unicode fallbacks are skipped exactly, with group-scoped uc and signed surrogate pairs", () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg936\uc2\u20320\'c4\'e3\u22909\'ba\'c3{\uc0\u20013\u25991}\u20320??\par\uc1\u-10179?\u-8704?}`;
  expect(extractLegacyWordText(rtf)).toBe("你好中文你\n😀");
});

test("RTF group formatting is scoped and hyperlink field instructions stay hidden", () => {
  const rtf = String.raw`{\rtf1 before {\v hidden} after {\field{\*\fldinst HYPERLINK "https://example.com"}{\fldrslt Link text}}}`;
  expect(extractLegacyWordText(rtf)).toBe("before  after Link text");
});

test("RTF binary destinations skip their exact length instead of parsing contained braces", () => {
  expect(
    extractLegacyWordText(String.raw`{\rtf1 Hello {\pict\bin3 {}}} world}`),
  ).toBe("Hello  world");
});

test.each([
  "{\\rtf1 unclosed",
  "{\\rtf1 invalid \\'xz}",
  "{\\rtf1\\uc9999999999999999999999 broken}",
  "{\\rtf1\\bin999 missing}",
  "{\\rtf2 unsupported}",
  "{\\rtf1\\ansicpg777 \\'ff}",
  "{\\rtf1\\ansicpg936 \\'c4}",
  String.raw`{\rtf1{\upr{fallback}{\*\unknown text}}}`,
  String.raw`{\rtf1{\upr{fallback}}}`,
  String.raw`{\rtf1{\fonttbl{\f0\fcharset128 Japanese;}}\f0 \'c4\'e3}`,
  '<?xml version="1.0"?><w:wordDocument>',
  "<unrecognized><text>content</text></unrecognized>",
  '<?xml version="1.0"?><!DOCTYPE wordDocument SYSTEM "https://not-requested.example/a.dtd"><wordDocument/>',
])("malformed or unsupported text formats give DOCX/PDF advice: %s", (text) => {
  expect(() => extractLegacyWordText(text)).toThrow(/另存为 DOCX 或 PDF/);
});

test("rejects deeply nested RTF but lets the attachment budget govern long plain DOC text", () => {
  expect(() =>
    extractLegacyWordText("{\\rtf1" + "{".repeat(300) + "x" + "}".repeat(301)),
  ).toThrow("另存为 DOCX 或 PDF");
  const plainDoc = "x".repeat(4 * 1024 * 1024 + 1);
  expect(extractLegacyWordText(plainDoc)).toBe(plainDoc);
});
