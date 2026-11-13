export type TextAttachment = { id: string; name: string; text: string };

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARACTERS = 60000;
export const MAX_TOTAL_CHARACTERS = 80000;
export const MAX_DOCUMENTS = 5;
export const MAX_IMAGES = 3;
const TEXT_EXTENSIONS = new Set(
  "txt md mdx csv tsv json jsonl js jsx ts tsx py java c cpp h hpp cs go rs rb php html css scss sql sh bash ps1 yaml yml toml xml svg log ini conf vue svelte kt swift r m dockerfile gitignore".split(
    " ",
  ),
);

export const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,application/pdf," +
  Array.from(TEXT_EXTENSIONS, (extension) => `.${extension}`).join(",");

export function attachmentKind(file: Pick<File, "name" | "type" | "size">) {
  if (!file.size) throw new Error("文件为空，无法读取。");
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new Error("单个文件不能超过 10 MB。");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return "image" as const;
  if (extension === "pdf" || file.type === "application/pdf")
    return "pdf" as const;
  if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    if (file.size > 2 * 1024 * 1024)
      throw new Error("文本或代码文件不能超过 2 MB。");
    return "text" as const;
  }
  throw new Error("请选择 PNG/JPEG/WebP/GIF 图片、PDF 或文本代码文件。");
}

export function validateAttachmentText(text: string) {
  if (!text.trim())
    throw new Error("未找到可读取的文字。扫描版 PDF 请改用图片发送。");
  if (text.includes("\0"))
    throw new Error("文件包含二进制内容，请选择 UTF-8 文本文件。");
  if (text.length > MAX_TEXT_CHARACTERS) {
    throw new Error("文件文字超过 60,000 字符，请拆分后添加。");
  }
  return text;
}

export async function readTextAttachment(file: File): Promise<string> {
  const kind = attachmentKind(file);
  if (kind === "image") throw new Error("图片应通过图片附件添加。");
  if (kind === "text") {
    const bytes = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("请将文件保存为 UTF-8 编码后重试。");
    }
    return validateAttachmentText(text);
  }

  // Loaded only in the browser when a PDF is selected. No upload or server storage.
  const pdfjs = await import("pdfjs-dist");
  const assets = `/pdfjs/${pdfjs.version}/`;
  pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
  });
  try {
    const document = await task.promise;
    if (document.numPages > 100)
      throw new Error("PDF 超过 100 页，请拆分后添加。");
    const pages: string[] = [];
    let length = 0;
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("");
      const pageText = `[第 ${i} 页]\n${text}`;
      length += pageText.length;
      if (length > MAX_TEXT_CHARACTERS)
        throw new Error("PDF 文字超过 60,000 字符，请拆分后添加。");
      if (text.trim()) pages.push(pageText);
      page.cleanup();
    }
    return validateAttachmentText(pages.join("\n\n"));
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new Error("请先解除 PDF 的密码保护，再添加文件。");
    }
    throw error;
  } finally {
    await task.destroy();
  }
}

export function messageWithAttachments(
  input: string,
  attachments: TextAttachment[],
) {
  const blocks = attachments.map(({ name, text }) => {
    const longestFence = Math.max(
      2,
      ...(text.match(/`+/g) ?? []).map((x) => x.length),
    );
    const fence = "`".repeat(longestFence + 1);
    return `[附件：${name.replace(
      /[\r\n]/g,
      " ",
    )}]\n${fence}text\n${text}\n${fence}`;
  });
  return [input.trim(), ...blocks].filter(Boolean).join("\n\n");
}
