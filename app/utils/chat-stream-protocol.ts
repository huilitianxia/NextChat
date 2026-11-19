export const CHAT_STREAM_HEADER = "x-nextchat-chat-stream";
export const CHAT_STREAM_ERROR = "nextchat.error";
export const CHAT_STREAM_EFFORT = "nextchat.effort";
export const GATEWAY_TIMEOUT_MESSAGE =
  "模型思考时间过长触发了网关超时，请点击重试，或尝试将推理强度调低后再试";
export const CHAT_INTERRUPTED_MESSAGE =
  "检测到页面切后台或网络波动导致连接中断，请点击重新生成（建议生成期间保持屏幕常亮）";

export function isChatNetworkInterruption(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: string; message?: string };
  return (
    name === "AbortError" ||
    /load failed|failed to fetch|network\s?error|network request failed/i.test(
      message || "",
    )
  );
}

export function isGatewayTimeout(status?: number, detail = "") {
  return status === 504 || /\bFUNCTION_INVOCATION_TIMEOUT\b/i.test(detail);
}
