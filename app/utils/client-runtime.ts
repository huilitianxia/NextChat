const scripts = new Map<string, Promise<void>>();
export function loadClientScript(url: string): Promise<void> {
  if (typeof document === "undefined")
    return Promise.reject(new Error("此工具仅可在浏览器中使用。"));
  let promise = scripts.get(url);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error("本地工具加载超时，请重试。"));
      }, 30000);
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("工具资源加载失败，请检查网络后重试。"));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      scripts.delete(url);
      throw error;
    });
    scripts.set(url, promise);
  }
  return promise;
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export async function svgPng(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const factor = Math.min(
      scale,
      4096 / Math.max(image.width || 800, image.height || 600),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.width || 800) * factor));
    canvas.height = Math.max(1, Math.round((image.height || 600) * factor));
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("图片导出失败"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
