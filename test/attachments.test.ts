/** @jest-environment node */

import { jest } from "@jest/globals";
import {
  attachmentKind,
  MAX_ATTACHMENT_BYTES,
  MAX_TEXT_CHARACTERS,
  messageWithAttachments,
  readTextAttachment,
  validateAttachmentText,
} from "../app/utils/attachments";

const pdfGetDocument = jest.fn<(...args: unknown[]) => unknown>();
jest.unstable_mockModule("pdfjs-dist", () => ({
  getDocument: pdfGetDocument,
  GlobalWorkerOptions: { workerSrc: "" },
}));

function sample(name: string, type: string, size = 20) {
  return { name, type, size };
}

describe("local attachments", () => {
  test("accepts common code files and PDF files without a browser MIME type", () => {
    expect(attachmentKind(sample("组件.TSX", ""))).toBe("text");
    expect(attachmentKind(sample("报告.PDF", ""))).toBe("pdf");
    expect(attachmentKind(sample("Dockerfile", ""))).toBe("text");
    expect(attachmentKind(sample(".gitignore", ""))).toBe("text");
    expect(attachmentKind(sample("photo.jpg", "image/jpeg"))).toBe("image");
    // SVG remains plain source text, never executable image markup.
    expect(attachmentKind(sample("drawing.svg", "image/svg+xml"))).toBe("text");
  });

  test("rejects empty, oversized and unsupported binary attachments before reading", () => {
    expect(() => attachmentKind(sample("empty.txt", "text/plain", 0))).toThrow(
      "为空",
    );
    expect(() =>
      attachmentKind(sample("archive.zip", "application/zip")),
    ).toThrow("请选择");
    expect(() =>
      attachmentKind(
        sample("large.png", "image/png", MAX_ATTACHMENT_BYTES + 1),
      ),
    ).toThrow("10 MB");
    expect(() =>
      attachmentKind(sample("large.txt", "text/plain", 2 * 1024 * 1024 + 1)),
    ).toThrow("2 MB");
    expect(
      attachmentKind(
        sample("exact.pdf", "application/pdf", MAX_ATTACHMENT_BYTES),
      ),
    ).toBe("pdf");
  });

  test("preserves UTF-8 source text exactly while rejecting binary or undecodable files", async () => {
    const source = "const 欢迎 = '你好 🌤️';\r\nconsole.log(欢迎);\n";
    await expect(
      readTextAttachment(new File([source], "main.ts", { type: "text/plain" })),
    ).resolves.toBe(source);
    await expect(
      readTextAttachment(new File(["\0binary"], "fake.txt")),
    ).rejects.toThrow("二进制");
    await expect(
      readTextAttachment(
        new File([new Uint8Array([0xff, 0xfe, 0x80])], "legacy.txt"),
      ),
    ).rejects.toThrow("UTF-8");
    await expect(
      readTextAttachment(new File(["   \n"], "blank.md")),
    ).rejects.toThrow("未找到");
    await expect(
      readTextAttachment(
        new File(["image bytes"], "a.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("图片附件");
  });

  test("never silently truncates long document text", () => {
    const exact = "字".repeat(MAX_TEXT_CHARACTERS);
    expect(validateAttachmentText(exact)).toBe(exact);
    expect(() => validateAttachmentText(exact + "字")).toThrow("60,000");
  });

  test("keeps code fences inside attachments from closing the wrapper", () => {
    const text = "```js\nconst a = 1;\n```\n`````\n中文";
    const message = messageWithAttachments("  看一下  ", [
      { id: "a", name: "notes\n.md", text },
    ]);
    expect(
      message.startsWith("看一下\n\n[附件：notes .md]\n``````text\n"),
    ).toBe(true);
    expect(message.endsWith(`${text}\n\`\`\`\`\`\``)).toBe(true);
    expect(messageWithAttachments("  你好  ", [])).toBe("你好");
    expect(
      messageWithAttachments("", [
        { id: "a", name: "a.ts", text: "const x = 1;" },
      ]),
    ).toContain("const x = 1;");
  });
});

describe("PDF extraction bounds and cleanup", () => {
  beforeEach(() => pdfGetDocument.mockReset());

  function pdfTask(
    options: { pages?: number; text?: string; error?: Error } = {},
  ) {
    const cleanup = jest.fn();
    const getPage = jest.fn(async () => ({
      getTextContent: async () => ({
        items:
          options.text === undefined
            ? []
            : [{ str: options.text, hasEOL: true }],
      }),
      cleanup,
    }));
    const destroy = jest.fn(async () => {});
    pdfGetDocument.mockReturnValue({
      promise: options.error
        ? Promise.reject(options.error)
        : Promise.resolve({ numPages: options.pages ?? 1, getPage }),
      destroy,
    });
    return { getPage, cleanup, destroy };
  }

  const file = () =>
    new File(["%PDF-test"], "sample.pdf", { type: "application/pdf" });

  test("extracts text with page labels and destroys the worker", async () => {
    const task = pdfTask({ pages: 2, text: "中文 PDF 内容" });
    const result = await readTextAttachment(file());
    expect(result).toContain("[第 1 页]\n中文 PDF 内容");
    expect(result).toContain("[第 2 页]\n中文 PDF 内容");
    expect(task.cleanup).toHaveBeenCalledTimes(2);
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  test("rejects scanned PDFs rather than claiming an empty attachment was read", async () => {
    const task = pdfTask();
    await expect(readTextAttachment(file())).rejects.toThrow("扫描版 PDF");
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  test("rejects excessive page counts before extracting any page", async () => {
    const task = pdfTask({ pages: 101, text: "text" });
    await expect(readTextAttachment(file())).rejects.toThrow("100 页");
    expect(task.getPage).not.toHaveBeenCalled();
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  test("rejects excessive PDF text without truncating and cleans up", async () => {
    const task = pdfTask({ text: "a".repeat(MAX_TEXT_CHARACTERS + 1) });
    await expect(readTextAttachment(file())).rejects.toThrow("60,000");
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  test("explains password-protected PDFs and destroys the failed loading task", async () => {
    const error = new Error("Need a password");
    error.name = "PasswordException";
    const task = pdfTask({ error });
    await expect(readTextAttachment(file())).rejects.toThrow("密码保护");
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });
});
