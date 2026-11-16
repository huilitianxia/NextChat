export const CAPABILITY_CHECKS = [
  { id: "chat", label: "对话模型", model: "gpt-6.1-sol" },
  { id: "audio", label: "音频转写", model: "whisper-1" },
  { id: "search", label: "联网检索", model: "gpt-6.1-sol · web_search" },
  { id: "image", label: "图片精修", model: "gpt-image-2.6-sunburst" },
] as const;
export type CapabilityId = (typeof CAPABILITY_CHECKS)[number]["id"];
export type CapabilityResult = {
  id: CapabilityId;
  status: "ok" | "fallback" | "error";
  model: string;
  message: string;
  durationMs: number;
  httpStatus?: number;
};
export type CapabilityEvent =
  | { type: "pending" }
  | { type: "result"; result: CapabilityResult }
  | { type: "done"; checkedAt: string };
