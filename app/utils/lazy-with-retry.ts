export function isChunkLoadError(error: unknown) {
  const e = error as { name?: string; message?: string };
  return /ChunkLoadError|Loading (?:CSS )?chunk .+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    `${e?.name || ""} ${e?.message || ""}`,
  );
}
export function lazyWithRetry<T>(
  loader: () => Promise<T>,
  onExhausted: () => void = notifyChunkRefresh,
) {
  return async () => {
    try {
      return await loader();
    } catch (first) {
      if (!isChunkLoadError(first)) throw first;
      try {
        return await loader();
      } catch (last) {
        if (isChunkLoadError(last)) onExhausted();
        throw last;
      }
    }
  };
}
export function claimRefresh(
  storage: Pick<Storage, "getItem" | "setItem">,
  build: string,
) {
  const key = "campus:chunk-refresh";
  try {
    if (storage.getItem(key) === build) return false;
    storage.setItem(key, build);
    return true;
  } catch {
    return false;
  }
}
let scheduled = false;
export function notifyChunkRefresh() {
  if (typeof window === "undefined" || scheduled) return;
  let build = "unknown";
  try {
    build =
      JSON.parse(
        document.querySelector<HTMLMetaElement>('meta[name="config"]')
          ?.content || "{}",
      ).commitHash || build;
    if (!claimRefresh(window.sessionStorage, build)) return;
  } catch {
    return;
  }
  scheduled = true;
  window.dispatchEvent(new Event("campus:before-reload"));
  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.dataset.chunkRefresh = "true";
  toast.textContent = "工作台已更新至最新版本，正在自动同步刷新...";
  Object.assign(toast.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "30000",
    maxWidth: "calc(100vw - 48px)",
    padding: "14px 20px",
    borderRadius: "14px",
    background: "#194f49",
    color: "white",
    boxShadow: "0 8px 30px #0003",
    fontSize: "14px",
  });
  document.body.appendChild(toast);
  setTimeout(() => window.location.reload(), 1000);
}
