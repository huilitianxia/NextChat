/** @jest-environment node */

import { jest } from "@jest/globals";
import {
  MAX_PDF_IMAGE_DATA_URL_LENGTH,
  readDocumentAttachment,
} from "../app/utils/attachments";

const getDocument = jest.fn<(...args: unknown[]) => unknown>();
jest.unstable_mockModule("pdfjs-dist", () => ({
  getDocument,
  version: "4.10.38",
  GlobalWorkerOptions: { workerSrc: "" },
}));

type FakeCanvas = {
  width: number;
  height: number;
  page: number;
  getContext: () => { canvas: FakeCanvas } | null;
  toDataURL: (type: string, quality: number) => string;
};
type RenderCall = {
  canvasContext: { canvas: FakeCanvas };
  viewport: { width: number; height: number };
  background: string;
};
const canvases: FakeCanvas[] = [];
const encoded: Array<{
  page: number;
  width: number;
  height: number;
  quality: number;
}> = [];
const oversized =
  "data:image/jpeg;base64," + "x".repeat(MAX_PDF_IMAGE_DATA_URL_LENGTH);
let encode: (canvas: FakeCanvas, quality: number) => string;
let noContext = false;
const createElement = jest.fn((name: string) => {
  expect(name).toBe("canvas");
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    page: 0,
    getContext: () => (noContext ? null : { canvas }),
    toDataURL: (type, quality) => {
      expect(type).toBe("image/jpeg");
      encoded.push({
        page: canvas.page,
        width: canvas.width,
        height: canvas.height,
        quality,
      });
      return encode(canvas, quality);
    },
  };
  canvases.push(canvas);
  return canvas;
});
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);

beforeAll(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement },
  });
});
beforeEach(() => {
  getDocument.mockReset();
  createElement.mockClear();
  canvases.length = 0;
  encoded.length = 0;
  noContext = false;
  encode = (canvas) => `data:image/jpeg;base64,page${canvas.page}`;
});
afterAll(() => {
  if (originalDocument)
    Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

function pdf(
  options: {
    texts?: string[];
    pages?: number;
    width?: number;
    height?: number;
    failTextPage?: number;
    failRenderPage?: number;
  } = {},
) {
  const pageCount = options.pages ?? options.texts?.length ?? 1;
  const renderOrder: number[] = [];
  const pages = Array.from({ length: pageCount }, (_, index) => {
    const number = index + 1;
    return {
      getTextContent: jest.fn(async () => {
        if (options.failTextPage === number)
          throw new Error("text extraction failed");
        return { items: [{ str: options.texts?.[index] ?? "", hasEOL: true }] };
      }),
      cleanup: jest.fn(),
      getViewport: jest.fn(({ scale }: { scale: number }) => ({
        width: (options.width ?? 600) * scale,
        height: (options.height ?? 840) * scale,
      })),
      render: jest.fn((args: RenderCall) => {
        expect(args.background).toBe("rgb(255,255,255)");
        args.canvasContext.canvas.page = number;
        renderOrder.push(number);
        return {
          promise:
            options.failRenderPage === number
              ? Promise.reject(new Error("page render failed"))
              : Promise.resolve(),
        };
      }),
    };
  });
  const getPage = jest.fn(async (number: number) => pages[number - 1]);
  const destroy = jest.fn(async () => {});
  getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: pageCount, getPage }),
    destroy,
  });
  return { pages, renderOrder, getPage, destroy };
}

const file = () =>
  new File(["%PDF-test"], "扫描件.pdf", { type: "application/pdf" });
const read = (maxImages = 8) =>
  readDocumentAttachment(file(), { supportsVision: true, maxImages });

test("normal text PDFs stay text, even with no image slots available", async () => {
  const task = pdf({ texts: ["正文内容".repeat(30)] });
  const result = await read(0);
  expect(result.text).toContain("正文内容");
  expect(result.images).toEqual([]);
  expect(result.notice).toBeUndefined();
  expect(createElement).not.toHaveBeenCalled();
  expect(task.destroy).toHaveBeenCalledTimes(1);
});

test("renders only the first five scanned pages in order and explains the scope", async () => {
  const task = pdf({ pages: 7 });
  const result = await read();
  expect(result.images).toEqual(
    [1, 2, 3, 4, 5].map((p) => `data:image/jpeg;base64,page${p}`),
  );
  expect(task.renderOrder).toEqual([1, 2, 3, 4, 5]);
  expect(result.notice).toContain("共 7 页");
  expect(result.notice).toContain("前 5 页");
  expect(result.text).toContain("第 1–5 页");
  expect(result.text).toContain("其余页面未提供图片");
  expect(task.pages[5].render).not.toHaveBeenCalled();
  expect(task.destroy).toHaveBeenCalledTimes(1);
  expect(
    canvases.every((canvas) => canvas.width === 0 && canvas.height === 0),
  ).toBe(true);
});

test("page labels and whitespace cannot disguise sparse footer-only text", async () => {
  const footer = "f".repeat(35) + " \n".repeat(30);
  pdf({ texts: [footer, footer] });
  const result = await read();
  expect(result.images).toHaveLength(2);
  expect(result.text).toContain("f".repeat(35));
  expect(result.notice).toContain("共 2 页");
});

test("forty readable characters per page meet the text threshold", async () => {
  pdf({ texts: ["字".repeat(40)] });
  expect((await read()).images).toEqual([]);
  expect(createElement).not.toHaveBeenCalled();
});

test("without vision, empty scans explain switching model and never render", async () => {
  const task = pdf();
  await expect(
    readDocumentAttachment(file(), { supportsVision: false, maxImages: 8 }),
  ).rejects.toThrow("切换支持图片的模型");
  expect(createElement).not.toHaveBeenCalled();
  expect(task.destroy).toHaveBeenCalledTimes(1);
});

test("insufficient image slots fail before any page is rendered", async () => {
  const task = pdf({ pages: 7 });
  await expect(read(4)).rejects.toThrow("需要 5 个图片位置");
  expect(task.renderOrder).toEqual([]);
  expect(createElement).not.toHaveBeenCalled();
  expect(task.destroy).toHaveBeenCalledTimes(1);
});

test("text extraction errors still clean up the page and document", async () => {
  const task = pdf({ failTextPage: 1 });
  await expect(read()).rejects.toThrow("text extraction failed");
  expect(task.pages[0].cleanup).toHaveBeenCalledTimes(1);
  expect(task.destroy).toHaveBeenCalledTimes(1);
});

test("render failure rejects the entire result and releases all allocated canvases", async () => {
  const task = pdf({ pages: 3, failRenderPage: 2 });
  await expect(read()).rejects.toThrow("page render failed");
  expect(task.renderOrder).toEqual([1, 2]);
  expect(task.pages[1].cleanup).toHaveBeenCalledTimes(2);
  expect(task.pages[2].render).not.toHaveBeenCalled();
  expect(task.destroy).toHaveBeenCalledTimes(1);
  expect(
    canvases.every((canvas) => canvas.width === 0 && canvas.height === 0),
  ).toBe(true);
});

test("canvas initialization failure still releases resources", async () => {
  noContext = true;
  const task = pdf();
  await expect(read()).rejects.toThrow("浏览器无法创建图片");
  expect(task.pages[0].cleanup).toHaveBeenCalledTimes(2);
  expect(task.destroy).toHaveBeenCalledTimes(1);
  expect(canvases[0].width).toBe(0);
  expect(canvases[0].height).toBe(0);
});

test("limits huge PDF page dimensions before allocating a canvas", async () => {
  pdf({ width: 200000, height: 300000 });
  await read();
  expect(encoded[0].width).toBeLessThanOrEqual(2200);
  expect(encoded[0].height).toBeLessThanOrEqual(2200);
  expect(Math.max(encoded[0].width, encoded[0].height)).toBeGreaterThanOrEqual(
    2199,
  );
});

test("tries JPEG quality before shrinking a readable page", async () => {
  const task = pdf();
  encode = (canvas, quality) =>
    quality > 0.74 ? oversized : `data:image/jpeg;base64,page${canvas.page}`;
  const result = await read();
  expect(result.images[0].length).toBeLessThanOrEqual(
    MAX_PDF_IMAGE_DATA_URL_LENGTH,
  );
  expect(encoded.map((entry) => entry.quality)).toEqual([0.9, 0.82, 0.74]);
  expect(
    new Set(encoded.map((entry) => `${entry.width}x${entry.height}`)).size,
  ).toBe(1);
  expect(task.pages[0].render).toHaveBeenCalledTimes(1);
});

test("bounded downscaling preserves a useful minimum size instead of returning a blurry page", async () => {
  const task = pdf();
  encode = () => oversized;
  await expect(read()).rejects.toThrow("保持清晰度");
  expect(
    encoded.every((entry) => Math.max(entry.width, entry.height) >= 1199),
  ).toBe(true);
  expect(encoded.every((entry) => entry.quality >= 0.65)).toBe(true);
  expect(task.pages[0].render.mock.calls.length).toBeLessThanOrEqual(6);
  expect(task.destroy).toHaveBeenCalledTimes(1);
  expect(
    canvases.every((canvas) => canvas.width === 0 && canvas.height === 0),
  ).toBe(true);
});

test("invalid viewport sizes fail without creating a canvas", async () => {
  const task = pdf({ width: Number.NaN });
  await expect(read()).rejects.toThrow("页面尺寸无效");
  expect(createElement).not.toHaveBeenCalled();
  expect(task.destroy).toHaveBeenCalledTimes(1);
});
