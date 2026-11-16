export async function renderedPng(node: HTMLElement, scale = 2): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  await document.fonts.ready;
  const width = Math.ceil(node.scrollWidth),
    height = Math.ceil(node.scrollHeight);
  if (
    !width ||
    !height ||
    height > 16000 ||
    width > 5000 ||
    width * height * scale * scale > 80000000
  )
    throw new Error("内容超过长图尺寸限制，请分段导出。");
  const blob = await toBlob(node, {
    pixelRatio: scale,
    width,
    height,
    backgroundColor:
      getComputedStyle(document.documentElement)
        .getPropertyValue("--white")
        .trim() || "#fff",
    filter: (el) =>
      !(
        el instanceof HTMLElement &&
        el.matches("button,input,textarea,select,[data-export-hide]")
      ),
    style: {
      maxHeight: "none",
      overflow: "visible",
      height: height + "px",
      width: width + "px",
      margin: "0",
    },
    cacheBust: false,
  });
  if (!blob) throw new Error("PNG 导出失败。请检查图片是否允许跨域读取。");
  return blob;
}
