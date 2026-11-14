/** @jest-environment node */

import { jest } from "@jest/globals";
import {
  ATTACHMENT_ACCEPT,
  attachmentKind,
  decodeAttachmentText,
  LEGACY_BINARY_DOC_ERROR,
  MAX_TEXT_CHARACTERS,
  readDocumentAttachment,
} from "../app/utils/attachments";

const extractRawText = jest.fn<
  (input: { arrayBuffer: ArrayBuffer }) => Promise<{
    value: string;
    messages: Array<{ type: string; message: string }>;
  }>
>();
jest.unstable_mockModule("mammoth", () => ({ extractRawText }));
beforeEach(() => {
  extractRawText.mockReset();
  extractRawText.mockResolvedValue({
    value: "第一段\n\n表头\n\n表格单元格\n\n",
    messages: [],
  });
});
const read = (file: File) =>
  readDocumentAttachment(file, { supportsVision: false, maxImages: 0 });
const docx = (name = "报告.docx") =>
  new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])], name);

test.each(["txt", "md", "csv", "json", "log", "docx", "doc"])(
  "picker and MIME-independent validation accept .%s",
  (extension) => {
    expect(ATTACHMENT_ACCEPT.split(",")).toContain(`.${extension}`);
    expect(
      attachmentKind({
        name: `文件.${extension.toUpperCase()}`,
        type: "",
        size: 30,
      }),
    ).toBe(extension === "docx" || extension === "doc" ? extension : "text");
  },
);

test("Word extensions are not mistaken for text when browsers send generic text MIME", () => {
  expect(
    attachmentKind({ name: "export.docx", type: "text/plain", size: 12 }),
  ).toBe("docx");
  expect(
    attachmentKind({ name: "export.doc", type: "text/xml", size: 12 }),
  ).toBe("doc");
  expect(
    attachmentKind({ name: "export", type: "application/msword", size: 12 }),
  ).toBe("doc");
});

test("UTF-8 (including BOM/emoji) is preserved without guessing another encoding", async () => {
  const source = "第一行 🌤️\r\nconst x = 1;\n";
  expect((await read(new File(["\uFEFF" + source], "notes.txt"))).text).toBe(
    source,
  );
});

test.each(["txt", "csv", "json", "log", "md"])(
  "GBK .%s decodes to readable Chinese",
  async (extension) => {
    const bytes = new Uint8Array([
      0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4, 0x0d, 0x0a,
    ]);
    expect((await read(new File([bytes], `旧文档.${extension}`))).text).toBe(
      "中文测试\r\n",
    );
  },
);

test("UTF-16 BOMs decode without being misclassified as binary or GBK", () => {
  expect(
    decodeAttachmentText(
      new Uint8Array([0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65]).buffer,
    ),
  ).toBe("中文");
  expect(
    decodeAttachmentText(
      new Uint8Array([0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87]).buffer,
    ),
  ).toBe("中文");
});

test("invalid encodings and binary control characters never become successful text attachments", async () => {
  await expect(
    read(new File([new Uint8Array([0xff, 0xff])], "bad.txt")),
  ).rejects.toThrow("UTF-8 或 GBK");
  await expect(
    read(new File(["binary\u0001content"], "bad.log")),
  ).rejects.toThrow("二进制");
});

test.each(["报告.docx", "重命名.doc"])(
  "Mammoth receives a browser ArrayBuffer for %s; paragraphs and table text survive",
  async (name) => {
    const file = docx(name);
    const result = await read(file);
    expect(extractRawText).toHaveBeenCalledTimes(1);
    const input = extractRawText.mock.calls[0][0];
    expect(Object.keys(input)).toEqual(["arrayBuffer"]);
    expect(new Uint8Array(input.arrayBuffer)).toEqual(
      new Uint8Array(await file.arrayBuffer()),
    );
    expect(result.text).toBe("第一段\n\n表头\n\n表格单元格");
    expect(result.images).toEqual([]);
    expect(result.notice).toContain("图片与原始排版不包含");
  },
);

test("the exact friendly binary DOC guidance is returned before any parser runs", async () => {
  const file = new File(
    [new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    "旧版.doc",
  );
  await expect(read(file)).rejects.toThrow(LEGACY_BINARY_DOC_ERROR);
  expect(extractRawText).not.toHaveBeenCalled();
});

test("plain-text renamed DOC remains readable", async () => {
  const source = "第一段\r\n\r\n第二段";
  expect((await read(new File([source], "正文.doc"))).text).toBe(source);
});

test("corrupt DOCX and conversion errors produce friendly guidance instead of partial text", async () => {
  extractRawText.mockRejectedValueOnce(new Error("ZIP internal detail"));
  await expect(read(docx())).rejects.toThrow("无法读取此 Word 文档");
  extractRawText.mockResolvedValueOnce({
    value: "不完整",
    messages: [{ type: "error", message: "bad XML" }],
  });
  await expect(read(docx())).rejects.toThrow("另存为 .docx 或 .pdf");
});

test("empty and excessive Word text obey existing limits without silent truncation", async () => {
  extractRawText.mockResolvedValueOnce({ value: "\n\n", messages: [] });
  await expect(read(docx())).rejects.toThrow("未找到可读取");
  extractRawText.mockResolvedValueOnce({
    value: "字".repeat(MAX_TEXT_CHARACTERS + 1),
    messages: [],
  });
  await expect(read(docx())).rejects.toThrow("60,000");
});
