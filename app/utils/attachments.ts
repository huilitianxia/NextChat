import type { PDFPageProxy } from "pdfjs-dist";

export type TextAttachment = {
  id: string;
  name: string;
  text: string;
  imageUrls?: string[];
  notice?: string;
};
export type DocumentAttachment = {
  text: string;
  images: string[];
  notice?: string;
};

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARACTERS = 60000;
export const MAX_TOTAL_CHARACTERS = 80000;
export const MAX_DOCUMENTS = 5;
export const MAX_IMAGES = 8;
export const MAX_FILES = 8;
export const PDF_SPARSE_TEXT_THRESHOLD = 40;
export const MAX_PDF_IMAGE_PAGES = 5;
export const MAX_PDF_IMAGE_DATA_URL_LENGTH = 480 * 1024;
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

async function renderPdfPage(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1 });
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new Error("PDF 页面尺寸无效，无法转为图片。");
  }
  const originalEdge = Math.max(viewport.width, viewport.height);
  let scale = Math.min(2.5, 2200 / originalEdge);
  const minimumEdge = Math.min(1200, originalEdge * scale);
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建图片，请重试或更换浏览器。");
    while (true) {
      const target = page.getViewport({ scale });
      canvas.width = Math.max(1, Math.floor(target.width));
      canvas.height = Math.max(1, Math.floor(target.height));
      await page.render({
        canvasContext: context,
        viewport: target,
        background: "rgb(255,255,255)",
      }).promise;
      // Prefer readable dimensions; lower JPEG quality before reducing scale.
      for (const quality of [0.9, 0.82, 0.74, 0.65]) {
        const image = canvas.toDataURL("image/jpeg", quality);
        if (!image.startsWith("data:image/jpeg;base64,")) {
          throw new Error("浏览器无法导出 PDF 页面图片，请重试。");
        }
        if (image.length <= MAX_PDF_IMAGE_DATA_URL_LENGTH) return image;
      }
      const edge = originalEdge * scale;
      if (edge <= minimumEdge + 1) {
        throw new Error(
          "PDF 页面图片过大，无法在保持清晰度的同时添加；请裁剪页面后重试。",
        );
      }
      scale = Math.max(minimumEdge, edge * 0.85) / originalEdge;
    }
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function readDocumentAttachment(
  file: File,
  options: { supportsVision: boolean; maxImages: number },
): Promise<DocumentAttachment> {
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
    return { text: validateAttachmentText(text), images: [] };
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
    const pdf = await task.promise;
    if (pdf.numPages > 100) throw new Error("PDF 超过 100 页，请拆分后添加。");
    const pages: string[] = [];
    let length = 0;
    let readableCharacters = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
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
        readableCharacters += text.replace(/\s/g, "").length;
        if (text.trim()) pages.push(pageText);
      } finally {
        page.cleanup();
      }
    }
    const text = pages.join("\n\n");
    if (text) validateAttachmentText(text);
    const sparse =
      readableCharacters < PDF_SPARSE_TEXT_THRESHOLD * pdf.numPages;
    if (!sparse || !options.supportsVision) {
      if (!text) {
        throw new Error(
          "扫描版 PDF 未找到可读取的文字，请切换支持图片的模型后重新添加。",
        );
      }
      return { text, images: [] };
    }

    const pageCount = Math.min(pdf.numPages, MAX_PDF_IMAGE_PAGES);
    if (
      !Number.isFinite(options.maxImages) ||
      Math.floor(options.maxImages) < pageCount
    ) {
      throw new Error(
        `此 PDF 需要 ${pageCount} 个图片位置，请先移除其他图片后重新添加。`,
      );
    }
    const images: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      try {
        images.push(await renderPdfPage(page));
      } finally {
        page.cleanup();
      }
    }
    const scope = pageCount === 1 ? "第 1 页" : `第 1–${pageCount} 页`;
    const notice =
      pdf.numPages > pageCount
        ? `PDF 共 ${pdf.numPages} 页，文字较少，已将前 ${pageCount} 页（${scope}）转为图片；其余页面未转为图片。`
        : `PDF 共 ${pdf.numPages} 页，文字较少，已将${scope}转为图片。`;
    return {
      text: [
        `PDF「${file.name.replace(/[\r\n]/g, " ")}」共 ${
          pdf.numPages
        } 页。已提供${scope}的页面图片，按页码顺序排列。${
          pdf.numPages > pageCount ? "其余页面未提供图片。" : ""
        }`,
        text
          ? `以下为提取到的少量文字：\n${text}`
          : "此 PDF 无可提取文字，请根据页面图片阅读。",
      ].join("\n\n"),
      images,
      notice,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new Error("请先解除 PDF 的密码保护，再添加文件。");
    }
    throw error;
  } finally {
    await task.destroy();
  }
}

export async function readTextAttachment(file: File): Promise<string> {
  return (
    await readDocumentAttachment(file, { supportsVision: false, maxImages: 0 })
  ).text;
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
