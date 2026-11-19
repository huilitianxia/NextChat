export const CHAT_STREAM_HEADER = "x-nextchat-chat-stream";
export const CHAT_STREAM_ERROR = "nextchat.error";
export const CHAT_STREAM_EFFORT = "nextchat.effort";
export const GATEWAY_TIMEOUT_MESSAGE =
  "模型思考时间过长触发了网关超时，请点击重试，或尝试将推理强度调低后再试";

export function isGatewayTimeout(status?: number, detail = "") {
  return status === 504 || /\bFUNCTION_INVOCATION_TIMEOUT\b/i.test(detail);
}
