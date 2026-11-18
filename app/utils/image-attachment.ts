import { INLINE_IMAGE_LIMIT, fileSizeLabel } from "./attachment-policy";

export const MAX_IMAGE_EDGE = 2048;

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
  const objectUrl = URL.createObjectURL(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    signal?.throwIfAborted();
    const { naturalWidth: width, naturalHeight: height } = image;
    if (width < 1 || height < 1) throw new Error("invalid image dimensions");
    const edge = Math.max(width, height);
    if (
      edge <= MAX_IMAGE_EDGE &&
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
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
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
    URL.revokeObjectURL(objectUrl);
    if (canvas) canvas.width = canvas.height = 0;
  }
}
