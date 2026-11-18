/** @jest-environment node */

import { jest } from "@jest/globals";
import {
  attachmentKind,
  MAX_ATTACHMENT_BYTES,
  AttachmentTextLimitError,
  messageWithAttachments,
  readDocumentAttachment,
  readTextAttachment,
  validateAttachmentText,
} from "../app/utils/attachments";
import {
  STANDARD_ATTACHMENT_CHARACTERS,
  attachmentBudget,
  attachmentCharacterCount,
  attachmentOverflowLabel,
  chatMessagesBytes,
} from "../app/utils/attachment-policy";

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

  test("checks the 100 MB document limit while allowing large original images to be compressed", () => {
    expect(() => attachmentKind(sample("empty.txt", "text/plain", 0))).toThrow(
      "为空",
    );
    expect(() =>
      attachmentKind(sample("archive.zip", "application/zip")),
    ).toThrow("请选择");
    expect(
      attachmentKind(
        sample("large.png", "image/png", MAX_ATTACHMENT_BYTES + 1),
      ),
    ).toBe("image");
    for (const [name, kind] of [
      ["课件.pdf", "pdf"],
      ["课件.pptx", "pptx"],
      ["报告.docx", "docx"],
      ["notes.txt", "text"],
      ["data.xlsx", "xlsx"],
    ]) {
      expect(attachmentKind(sample(name, "", MAX_ATTACHMENT_BYTES))).toBe(kind);
      expect(() =>
        attachmentKind(sample(name, "", MAX_ATTACHMENT_BYTES + 1)),
      ).toThrow("104,857,601 字节");
    }
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

  test("documents use the selected model budget while keeping an exact Unicode prefix for explicit import", async () => {
    const prefix = "a".repeat(STANDARD_ATTACHMENT_CHARACTERS - 1) + "😀";
    const source = prefix + "中";
    const file = new File([source], "long.md");
    expect(validateAttachmentText(source)).toBe(source);
    await expect(readTextAttachment(file)).rejects.toMatchObject({
      name: "AttachmentTextLimitError",
      characterCount: STANDARD_ATTACHMENT_CHARACTERS + 1,
      available: STANDARD_ATTACHMENT_CHARACTERS,
      prefix,
    });
    await expect(
      readTextAttachment(file, attachmentBudget("gpt-6.2-sol").limit),
    ).resolves.toBe(source);
  });

  test("model and session planning choices set the per-message cap and a useful upgrade hint", () => {
    expect(attachmentBudget("gpt-6.2-sol").limit).toBe(500_000);
    expect(attachmentBudget("gpt-6.1-terra", 256_000).limit).toBe(150_000);
    expect(attachmentBudget("gpt-5-mini").limit).toBe(150_000);
    const ordinary = attachmentBudget("gpt-4o", 1_000_000);
    expect(ordinary.limit).toBe(50_000);
    expect(attachmentOverflowLabel(12_000, ordinary, 45_000)).toMatch(
      /12,000.*50,000.*5,000.*1M/,
    );
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

  test("large markdown files with many inline fences stay serializable within the request size", () => {
    const text = "`a ".repeat(140_000) + '😀"\\';
    const message = messageWithAttachments("", [
      { id: "a", name: "notes.md", text, notice: "已载入前 80% 内容。" },
    ]);
    expect(message).toContain("[导入说明：已载入前 80% 内容。]");
    expect(message.endsWith(`${text}\n\`\`\``)).toBe(true);
    const messages = [{ role: "user" as const, content: message }];
    expect(chatMessagesBytes(messages)).toBeGreaterThan(
      Buffer.byteLength(JSON.stringify({ messages })),
    );
  });
});

describe("PDF extraction bounds and cleanup", () => {
  beforeEach(() => pdfGetDocument.mockReset());

  function pdfTask(
    options: {
      pages?: number;
      text?: string | ((page: number) => string);
      error?: Error;
    } = {},
  ) {
    const cleanup = jest.fn();
    const getPage = jest.fn(async (page: number) => ({
      getTextContent: async () => ({
        items:
          options.text === undefined
            ? []
            : [
                {
                  str:
                    typeof options.text === "function"
                      ? options.text(page)
                      : options.text,
                  hasEOL: true,
                },
              ],
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

  test("whole books above 100 pages can be read when their text fits", async () => {
    const task = pdfTask({ pages: 101, text: (page) => `chapter ${page}` });
    await expect(readTextAttachment(file())).resolves.toContain(
      "[第 101 页]\nchapter 101",
    );
    expect(task.getPage).toHaveBeenCalledTimes(101);
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  test("PDF overflow measures all pages and releases the document before showing import choices", async () => {
    const task = pdfTask({
      pages: 2,
      text: (page) => `${page} ${"a".repeat(30000)}`,
    });
    const error = await readTextAttachment(file()).catch(
      (failure) => failure as AttachmentTextLimitError,
    );
    expect(error).toBeInstanceOf(AttachmentTextLimitError);
    if (typeof error === "string") throw new Error("overflow expected");
    expect(error.characterCount).toBe(60024);
    expect(error.pdf?.pages).toBe(2);
    expect(attachmentCharacterCount(error.prefix)).toBe(
      STANDARD_ATTACHMENT_CHARACTERS,
    );
    expect(task.cleanup).toHaveBeenCalledTimes(2);
    expect(task.destroy).toHaveBeenCalledTimes(1);
  });

  test("a selected range reads only requested pages and retains their actual page numbers", async () => {
    const task = pdfTask({ pages: 105, text: (page) => `chapter ${page}` });
    const result = await readDocumentAttachment(file(), {
      supportsVision: false,
      maxImages: 0,
      maxCharacters: STANDARD_ATTACHMENT_CHARACTERS,
      pdfRange: { start: 102, end: 103 },
    });
    expect(task.getPage.mock.calls).toEqual([[102], [103]]);
    expect(result.text).toContain("[第 103 页]\nchapter 103");
    expect(result.notice).toContain("第 102–103 页");
  });

  test("an invalid range skips page extraction and releases the document", async () => {
    const task = pdfTask({ pages: 3, text: "chapter" });
    await expect(
      readDocumentAttachment(file(), {
        supportsVision: false,
        maxImages: 0,
        maxCharacters: 150_000,
        pdfRange: { start: 3, end: 2 },
      }),
    ).rejects.toThrow("有效起止页码");
    expect(task.getPage).not.toHaveBeenCalled();
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
