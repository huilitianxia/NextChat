import { INLINE_IMAGE_LIMIT, fileSizeLabel } from "./attachment-policy";

export const MAX_IMAGE_EDGE = 2048;

function exifOrientation(data: DataView, offset: number, end: number) {
  if (offset + 14 > end || data.getUint32(offset) !== 0x45786966) return 1;
  const tiff = offset + 6;
  const littleEndian = data.getUint16(tiff) === 0x4949;
  if (data.getUint16(tiff + 2, littleEndian) !== 42) return 1;
  const directory = tiff + data.getUint32(tiff + 4, littleEndian);
  if (directory + 2 > end) return 1;
  const count = data.getUint16(directory, littleEndian);
  for (let index = 0; index < count; index++) {
    const field = directory + 2 + index * 12;
    if (field + 12 > end) break;
    if (data.getUint16(field, littleEndian) === 0x0112)
      return data.getUint16(field + 8, littleEndian);
  }
  return 1;
}

async function imageDimensions(file: Blob) {
  const data = new DataView(await file.slice(0, 512 * 1024).arrayBuffer());
  if (data.byteLength < 24) return;
  if (data.getUint32(0) === 0x89504e47 && data.getUint32(12) === 0x49484452)
    return {
      width: data.getUint32(16),
      height: data.getUint32(20),
      orientation: 1,
    };
  if (data.getUint16(0) !== 0xffd8) return;
  let offset = 2;
  let orientation = 1;
  while (offset + 4 < data.byteLength && data.getUint8(offset) === 0xff) {
    const marker = data.getUint8(offset + 1);
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = data.getUint16(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > data.byteLength) break;
    if (
      marker === 0xe1 &&
      length >= 16 &&
      data.getUint32(offset + 4) === 0x45786966
    )
      orientation = exifOrientation(data, offset + 4, end);
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker) &&
      length >= 8
    ) {
      const width = data.getUint16(offset + 7);
      const height = data.getUint16(offset + 5);
      return orientation >= 5 && orientation <= 8
        ? { width: height, height: width, orientation }
        : { width, height, orientation };
    }
    offset = end;
  }
}

function imageDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function prepareImageAttachment(file: File, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let objectUrl: string | undefined;
  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    const dimensions = await imageDimensions(file);
    const originalEdge = dimensions
      ? Math.max(dimensions.width, dimensions.height)
      : 0;
    const scale =
      originalEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / originalEdge : 1;
    signal?.throwIfAborted();
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
          ...(dimensions && scale < 1
            ? {
                resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
                resizeHeight: Math.max(
                  1,
                  Math.round(dimensions.height * scale),
                ),
                resizeQuality: "high" as const,
              }
            : {}),
        });
      } catch {
        // Older Safari and some image formats still need the HTML image decoder.
      }
    }
    let source: CanvasImageSource;
    let width: number;
    let height: number;
    if (bitmap) {
      source = bitmap;
      ({ width, height } = bitmap);
    } else {
      objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
    }
    signal?.throwIfAborted();
    if (width < 1 || height < 1) throw new Error("invalid image dimensions");
    const edge = Math.max(width, height);
    if (
      edge <= MAX_IMAGE_EDGE &&
      originalEdge <= MAX_IMAGE_EDGE &&
      (!dimensions || dimensions.orientation === 1) &&
      /^image\/(png|jpeg|webp|gif)$/.test(file.type) &&
      4 * Math.ceil(file.size / 3) + 32 <= INLINE_IMAGE_LIMIT
    ) {
      return await imageDataUrl(file);
    }

    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas context");
    let targetEdge = Math.min(MAX_IMAGE_EDGE, edge);
    while (targetEdge >= 1) {
      signal?.throwIfAborted();
      canvas.width = Math.max(1, Math.round((width * targetEdge) / edge));
      canvas.height = Math.max(1, Math.round((height * targetEdge) / edge));
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      let format = "image/webp";
      for (const quality of [0.92, 0.86, 0.8, 0.74]) {
        let encoded = canvas.toDataURL(format, quality);
        if (!encoded.startsWith(`data:${format};base64,`)) {
          format = "image/jpeg";
          context.globalCompositeOperation = "destination-over";
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.globalCompositeOperation = "source-over";
          encoded = canvas.toDataURL(format, quality);
        }
        if (
          encoded.startsWith(`data:${format};base64,`) &&
          encoded.length <= INLINE_IMAGE_LIMIT
        ) {
          return encoded;
        }
      }
      targetEdge = Math.floor(targetEdge * 0.84);
    }
    throw new Error("unable to encode image");
  } catch {
    signal?.throwIfAborted();
    throw new Error(
      `当前图片 ${fileSizeLabel(
        file.size,
      )}，浏览器无法解码或压缩到长边 ${MAX_IMAGE_EDGE}px、发送数据 256 KiB 以内。请另存为 JPEG 或 WebP 后重试。`,
    );
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (canvas) canvas.width = canvas.height = 0;
  }
}
