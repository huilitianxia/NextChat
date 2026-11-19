import type { PDFPageProxy } from "pdfjs-dist";
import {
  AttachmentTextBuffer,
  attachmentCharacterCount,
  MAX_ATTACHMENT_BYTES,
  STANDARD_ATTACHMENT_CHARACTERS,
  fileSizeLabel,
  numberLabel,
} from "./attachment-policy";

export { MAX_ATTACHMENT_BYTES } from "./attachment-policy";

export type TextAttachment = {
  id: string;
  name: string;
  text: string;
  imageUrls?: string[];
  notice?: string;
  labFile?: File;
};
export type DocumentAttachment = {
  text: string;
  images: string[];
  imagePageNumbers?: number[];
  notice?: string;
};

export type PdfPageRange = { start: number; end: number };

export class AttachmentTextLimitError extends Error {
  constructor(
    readonly characterCount: number,
    readonly available: number,
    readonly prefix: string,
    readonly pdf?: { pages: number; range?: PdfPageRange },
  ) {
    super(
      `当前文字 ${numberLabel(characterCount)} 字符，可用上限为 ${numberLabel(
        available,
      )} 字符。`,
    );
    this.name = "AttachmentTextLimitError";
  }
}

export class AttachmentFileSizeError extends Error {
  constructor(size: number) {
    super(`当前文件 ${fileSizeLabel(size)}，单份文档的本地解析上限为 100 MB。`);
    this.name = "AttachmentFileSizeError";
  }
}

type DocumentOptions = {
  supportsVision: boolean;
  maxImages: number;
  maxCharacters: number;
  pdfRange?: PdfPageRange;
  signal?: AbortSignal;
  onScannedPdf?: () => Promise<boolean>;
};

export const MAX_DOCUMENTS = 5;
export const MAX_IMAGES = 8;
export const MAX_FILES = 8;
export const PDF_SPARSE_TEXT_THRESHOLD = 40;
export const PDF_SCAN_CHARACTERS_PER_PAGE = 20;
export const PDF_SCAN_NOTICE =
  "检测到该 PDF 为纯图片扫描件（无内置文字层），无法直接提取文本；建议截图后使用「拍照识题」或转为图片上传";

export class ScannedPdfError extends Error {
  constructor() {
    super(PDF_SCAN_NOTICE);
    this.name = "ScannedPdfError";
  }
}
export const MAX_PDF_IMAGE_PAGES = 5;
export const MAX_PDF_IMAGE_DATA_URL_LENGTH = 480 * 1024;
export const LEGACY_BINARY_DOC_ERROR =
  "暂不支持旧版二进制 .doc 格式，请在 Word 或 WPS 中另存为 .docx 或 .pdf 后再上传";
const WORD_READ_ERROR =
  "无法读取此 Word 文档，请确认文件未损坏或加密，并在 Word 或 WPS 中另存为 .docx 或 .pdf 后重试。";
const WORD_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SHEET_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SLIDES_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const TEXT_EXTENSIONS = new Set(
  "txt md mdx csv tsv json jsonl js jsx ts tsx py java c cpp h hpp cs go rs rb php html css scss sql sh bash ps1 yaml yml toml xml svg log ini conf vue svelte kt swift r m dockerfile gitignore".split(
    " ",
  ),
);

export const ATTACHMENT_ACCEPT =
  `image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif,application/pdf,.pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,${SHEET_MIME},${SLIDES_MIME},${WORD_MIME},application/msword,application/vnd.ms-powerpoint,application/vnd.ms-excel,text/plain,text/markdown,text/csv,application/json,` +
  Array.from(TEXT_EXTENSIONS, (extension) => `.${extension}`).join(",");

export function attachmentKind(file: Pick<File, "name" | "type" | "size">) {
  if (!file.size) throw new Error("文件为空，无法读取。");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (
    /^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
    /^(png|jpe?g|webp|gif)$/.test(extension)
  )
    return "image" as const;
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new AttachmentFileSizeError(file.size);
  if (
    extension === "xlsx" ||
    extension === "xls" ||
    file.type === SHEET_MIME ||
    (file.type === "application/vnd.ms-excel" &&
      !TEXT_EXTENSIONS.has(extension))
  )
    return "xlsx" as const;
  // Word extensions take precedence over generic text MIME labels used by some pickers.
  if (extension === "docx") return "docx" as const;
  if (extension === "doc") return "doc" as const;
  if (file.type === WORD_MIME) return "docx" as const;
  if (file.type === "application/msword") return "doc" as const;
  if (extension === "pptx" || file.type === SLIDES_MIME) return "pptx" as const;
  if (extension === "ppt" || file.type === "application/vnd.ms-powerpoint")
    return "ppt" as const;
  if (extension === "pdf" || file.type === "application/pdf")
    return "pdf" as const;
  if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    return "text" as const;
  }
  throw new Error("请选择图片、PDF、Word、PPTX、Excel、文本或代码文件。");
}

export function validateAttachmentText(text: string) {
  if (!text.trim())
    throw new Error(
      "未找到可读取的文字，请检查文件内容；图片文档可另存为 PDF 后上传。",
    );
  if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text))
    throw new Error("文件包含二进制内容，请选择 UTF-8 或 GBK 文本文件。");
  return text;
}

export function decodeAttachmentText(bytes: ArrayBuffer): string {
  const data = new Uint8Array(bytes);
  // Word XML exports often carry a UTF-16 BOM. Never treat their NUL bytes as GBK.
  if (
    (data[0] === 0xff && data[1] === 0xfe) ||
    (data[0] === 0xfe && data[1] === 0xff)
  ) {
    try {
      return new TextDecoder(data[0] === 0xff ? "utf-16le" : "utf-16be", {
        fatal: true,
      }).decode(bytes);
    } catch {
      throw new Error("文件编码无法读取，请另存为 UTF-8 或 GBK 文本后重试。");
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      // Strict decoding avoids silently replacing invalid bytes with replacement characters.
      return new TextDecoder("gbk", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("文件编码无法读取，请另存为 UTF-8 或 GBK 文本后重试。");
    }
  }
}

function startsWithBytes(bytes: ArrayBuffer, signature: number[]) {
  const data = new Uint8Array(bytes);
  return signature.every((value, index) => data[index] === value);
}

async function readWordAttachment(
  bytes: ArrayBuffer,
  kind: "doc" | "docx",
): Promise<DocumentAttachment> {
  if (
    startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    throw new Error(kind === "doc" ? LEGACY_BINARY_DOC_ERROR : WORD_READ_ERROR);
  }
  // Also accept DOCX packages that have merely been renamed to .doc.
  if (kind === "docx" || startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    let text: string;
    try {
      // Parse in an inert document; never insert converted Word HTML into the page.
      const mammoth = await import("mammoth");
      const structured = typeof DOMParser !== "undefined";
      const result = structured
        ? await mammoth.convertToHtml(
            { arrayBuffer: bytes },
            {
              includeDefaultStyleMap: true,
              convertImage: mammoth.images.imgElement(() =>
                Promise.resolve({ src: "" }),
              ),
            },
          )
        : await mammoth.extractRawText({ arrayBuffer: bytes });
      if (result.messages.some((message) => message.type === "error")) {
        throw new Error(WORD_READ_ERROR);
      }
      if (structured) {
        const doc = new DOMParser().parseFromString(result.value, "text/html");
        const walk = (element: Element): string => {
          if (element.tagName === "TABLE")
            return (
              "[表格]\n" +
              [...element.querySelectorAll("tr")]
                .map((row) =>
                  [...row.children]
                    .map((cell) =>
                      (cell.textContent || "").trim().replace(/\s+/g, " "),
                    )
                    .join("\t"),
                )
                .join("\n") +
              "\n\n"
            );
          if (/^(P|H[1-6]|LI|BLOCKQUOTE)$/.test(element.tagName))
            return (
              (element.tagName === "LI" ? "- " : "") +
              (element.textContent || "").trim() +
              "\n\n"
            );
          return [...element.children].map(walk).join("");
        };
        text = walk(doc.body).trim();
      } else text = result.value.replace(/\r\n?/g, "\n").trim();
    } catch {
      throw new Error(WORD_READ_ERROR);
    }
    return {
      text: validateAttachmentText(text),
      images: [],
      notice: "已提取 Word 段落和表格文字；图片与原始排版不包含在内。",
    };
  }
  const { extractLegacyWordText } = await import("./legacy-word");
  const text = extractLegacyWordText(decodeAttachmentText(bytes));
  return { text: validateAttachmentText(text), images: [] };
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
  options: DocumentOptions,
): Promise<DocumentAttachment> {
  const kind = attachmentKind(file);
  if (kind === "image") throw new Error("图片应通过图片附件添加。");
  if (kind === "ppt")
    throw new Error("旧版 .ppt 请另存为 .pptx 或 PDF 后添加。");
  options.signal?.throwIfAborted();
  if (kind === "pdf") return readPdfAttachment(file, options);

  const bytes = await file.arrayBuffer();
  options.signal?.throwIfAborted();
  const text = new AttachmentTextBuffer(options.maxCharacters);
  let notice: string | undefined;
  if (kind === "text") {
    text.append(validateAttachmentText(decodeAttachmentText(bytes)));
  } else if (kind === "xlsx") {
    const { spreadsheetText } = await import("./doc-io");
    await spreadsheetText(bytes, text, options.signal);
  } else if (kind === "pptx") {
    const { extractPresentationText } = await import(
      "./presentation-attachment"
    );
    await extractPresentationText(bytes, text, options.signal);
  } else {
    const result = await readWordAttachment(bytes, kind);
    text.append(result.text);
    notice = result.notice;
  }
  options.signal?.throwIfAborted();
  if (text.characterCount > options.maxCharacters) {
    throw new AttachmentTextLimitError(
      text.characterCount,
      options.maxCharacters,
      text.text,
    );
  }
  return {
    text: validateAttachmentText(text.text),
    images: [],
    ...(notice ? { notice } : {}),
  };
}

export function validPdfRange({ start, end }: PdfPageRange, pages: number) {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 1 &&
    end >= start &&
    end <= pages
  );
}

export function pdfPageLabel({ start, end }: PdfPageRange) {
  return start === end ? `第 ${start} 页` : `第 ${start}–${end} 页`;
}

async function readPdfAttachment(
  file: File,
  options: DocumentOptions,
): Promise<DocumentAttachment> {
  // Loaded only in the browser when a PDF is selected. No upload or server storage.
  const pdfjs = await import("pdfjs-dist");
  const assets = `/pdfjs/${pdfjs.version}/`;
  pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  options.signal?.throwIfAborted();
  const task = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
  });
  try {
    const pdf = await task.promise;
    const range = options.pdfRange ?? { start: 1, end: pdf.numPages };
    if (!validPdfRange(range, pdf.numPages))
      throw new Error(`请输入 1 至 ${pdf.numPages} 的有效起止页码。`);
    const pageCount = range.end - range.start + 1;
    const textBuffer = new AttachmentTextBuffer(options.maxCharacters);
    const sparseThreshold = PDF_SPARSE_TEXT_THRESHOLD * pageCount;
    let readableCharacters = 0;
    for (let i = range.start; i <= range.end; i++) {
      options.signal?.throwIfAborted();
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("");
        if (text.trim()) {
          validateAttachmentText(text);
          if (textBuffer.characterCount) textBuffer.append("\n\n");
          textBuffer.append(`[第 ${i} 页]\n${text}`);
          if (readableCharacters < sparseThreshold)
            readableCharacters += attachmentCharacterCount(
              text.replace(/\s/g, ""),
            );
        }
      } finally {
        page.cleanup();
      }
    }
    options.signal?.throwIfAborted();
    if (
      readableCharacters < PDF_SCAN_CHARACTERS_PER_PAGE * pageCount &&
      options.onScannedPdf
    ) {
      const convert = await options.onScannedPdf();
      options.signal?.throwIfAborted();
      if (!convert || !options.supportsVision) throw new ScannedPdfError();
    }
    const text = textBuffer.text;
    if (textBuffer.characterCount > options.maxCharacters) {
      throw new AttachmentTextLimitError(
        textBuffer.characterCount,
        options.maxCharacters,
        text,
        {
          pages: pdf.numPages,
          range: options.pdfRange,
        },
      );
    }
    const sparse = readableCharacters < sparseThreshold;
    if (!sparse || !options.supportsVision) {
      if (!text) {
        throw new Error(
          "扫描版 PDF 未找到可读取的文字，请切换支持图片的模型后重新添加。",
        );
      }
      return {
        text,
        images: [],
        ...(options.pdfRange
          ? {
              notice: `PDF 共 ${pdf.numPages} 页，已导入${pdfPageLabel(
                range,
              )}的文字。`,
            }
          : {}),
      };
    }

    const imageCount = Math.min(pageCount, MAX_PDF_IMAGE_PAGES);
    if (
      !Number.isFinite(options.maxImages) ||
      Math.floor(options.maxImages) < imageCount
    ) {
      throw new Error(
        `此 PDF 需要 ${imageCount} 个图片位置，请先移除其他图片后重新添加。`,
      );
    }
    const images: string[] = [];
    const imagePageNumbers = Array.from(
      { length: imageCount },
      (_, index) => range.start + index,
    );
    for (const i of imagePageNumbers) {
      options.signal?.throwIfAborted();
      const page = await pdf.getPage(i);
      try {
        images.push(await renderPdfPage(page));
      } finally {
        page.cleanup();
      }
    }
    const scope = pdfPageLabel({
      start: range.start,
      end: imagePageNumbers.at(-1)!,
    });
    const notice =
      pageCount > imageCount
        ? `PDF 共 ${pdf.numPages} 页，${
            options.pdfRange ? "所选范围" : ""
          }文字较少，已将前 ${imageCount} 页（${scope}）转为图片；其余页面未转为图片。`
        : `PDF 共 ${pdf.numPages} 页，文字较少，已将${scope}转为图片。`;
    return {
      text: [
        `PDF「${file.name.replace(/[\r\n]/g, " ")}」共 ${
          pdf.numPages
        } 页。已提供${scope}的页面图片，按页码顺序排列。${
          pdf.numPages > imageCount ? "其余页面未提供图片。" : ""
        }`,
        text
          ? `以下为提取到的少量文字：\n${text}`
          : "此 PDF 无可提取文字，请根据页面图片阅读。",
      ].join("\n\n"),
      images,
      imagePageNumbers,
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

export async function readTextAttachment(
  file: File,
  maxCharacters = STANDARD_ATTACHMENT_CHARACTERS,
): Promise<string> {
  return (
    await readDocumentAttachment(file, {
      supportsVision: false,
      maxImages: 0,
      maxCharacters,
    })
  ).text;
}

export function messageWithAttachments(
  input: string,
  attachments: TextAttachment[],
) {
  const blocks = attachments.map(({ name, text, notice }) => {
    let longestFence = 2;
    for (const run of text.matchAll(/`+/g))
      longestFence = Math.max(longestFence, run[0].length);
    const fence = "`".repeat(longestFence + 1);
    return `[附件：${name.replace(/[\r\n]/g, " ")}]${
      notice ? `\n[导入说明：${notice}]` : ""
    }\n${fence}text\n${text}\n${fence}`;
  });
  return [input.trim(), ...blocks].filter(Boolean).join("\n\n");
}
