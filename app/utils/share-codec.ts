import LZString from "lz-string";
export type SharedMessage = { version: 1; title: string; content: string };
export const MAX_SHARE_LENGTH = 12000;
export function validateShare(value: any): SharedMessage {
  if (
    value?.version !== 1 ||
    typeof value.title !== "string" ||
    value.title.length > 160 ||
    typeof value.content !== "string" ||
    !value.content.trim() ||
    value.content.length > 60000
  )
    throw new Error("分享内容格式无效或超出长度限制。");
  return { version: 1, title: value.title, content: value.content };
}
export function encodeShare(content: string, title = "学习笔记") {
  const value = validateShare({
    version: 1,
    content,
    title: title.slice(0, 160),
  });
  const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(value));
  if (encoded.length > MAX_SHARE_LENGTH)
    throw new Error("内容太长，无法生成可靠链接；请改用长图或 Word。");
  return encoded;
}
export function decodeShare(encoded: string) {
  if (
    !encoded ||
    encoded.length > MAX_SHARE_LENGTH ||
    !/^[A-Za-z0-9+$-]+$/.test(encoded)
  )
    throw new Error("分享链接无效或过长。");
  const raw = LZString.decompressFromEncodedURIComponent(encoded);
  if (!raw || raw.length > 65000) throw new Error("分享内容无法读取。");
  return validateShare(JSON.parse(raw));
}
export function shareUrl(base: string, content: string, title?: string) {
  const url = new URL(base);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = `share=${encodeShare(content, title)}`;
  return url.toString();
}
export function decodeShareAsync(encoded: string): Promise<SharedMessage> {
  if (!encoded || encoded.length > MAX_SHARE_LENGTH)
    return Promise.reject(new Error("分享链接无效或过长。"));
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/share-worker.ts", import.meta.url),
    );
    let timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("分享解码器加载超时，请重试。"));
    }, 15000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = ({ data }) => {
      if (data.ready) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("分享内容解码超时。"));
        }, 1200);
        worker.postMessage(encoded);
        return;
      }
      finish();
      try {
        data.error
          ? reject(new Error(data.error))
          : resolve(validateShare(data.value));
      } catch (error) {
        reject(error);
      }
    };
    worker.onerror = () => {
      finish();
      reject(new Error("无法读取分享内容。"));
    };
  });
}
