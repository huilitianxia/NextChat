import { decodeShare } from "../utils/share-codec";
const scope = self as any;
scope.onmessage = (event: MessageEvent<string>) => {
  try {
    scope.postMessage({ value: decodeShare(event.data) });
  } catch {
    scope.postMessage({ error: "分享内容无效或无法解码。" });
  }
};
scope.postMessage({ ready: true });
