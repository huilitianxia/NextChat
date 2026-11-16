export const EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = (typeof EFFORTS)[number];
export const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: "极速",
  medium: "均衡",
  high: "深度",
  xhigh: "极限",
};
export const normalizeEffort = (value: unknown): ReasoningEffort =>
  EFFORTS.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : "medium";
export const isReasoningModel = (model: string) =>
  /^(?:gpt-[56](?:[.-]|$)|o[134](?:[.-]|$)|deepseek-r1(?:[.-]|$))/i.test(model);
export const effortPayload = (model: string, value: unknown) =>
  isReasoningModel(model) ? { reasoning_effort: normalizeEffort(value) } : {};
export function xhighUnsupported(status: number, data: any): boolean {
  if (![400, 422].includes(status)) return false;
  const error = data?.error || data;
  const message = String(error?.message || "");
  const param = String(error?.param || "");
  return (
    /xhigh/i.test(message) &&
    /unsupported|not supported|invalid|must be|supported values|allowed values|not one of/i.test(
      message,
    ) &&
    (/reasoning[_. ]?effort|reasoning\.effort/i.test(message + " " + param) ||
      param === "reasoning")
  );
}
export async function fetchWithEffortFallback(
  url: string,
  init: RequestInit,
  payload: Record<string, any>,
  responses = false,
) {
  const selected = responses
    ? payload.reasoning?.effort
    : payload.reasoning_effort;
  let response = await fetch(url, { ...init, body: JSON.stringify(payload) });
  let effective = selected;
  if (
    selected === "xhigh" &&
    !response.ok &&
    xhighUnsupported(
      response.status,
      await response
        .clone()
        .json()
        .catch(() => null),
    )
  ) {
    await response.body?.cancel();
    const retry = {
      ...payload,
      ...(responses
        ? { reasoning: { ...payload.reasoning, effort: "high" } }
        : { reasoning_effort: "high" }),
    };
    response = await fetch(url, { ...init, body: JSON.stringify(retry) });
    effective = "high";
  }
  return {
    response,
    effective: effective as ReasoningEffort | undefined,
    fallback: selected === "xhigh" && effective === "high",
  };
}
export function reportEffort(
  response: Response,
  onEffort?: (effort: ReasoningEffort, fallback: boolean) => void,
) {
  const effort = response.headers.get("x-nextchat-reasoning-effort");
  if (effort && EFFORTS.includes(effort as ReasoningEffort))
    onEffort?.(
      effort as ReasoningEffort,
      response.headers.get("x-nextchat-reasoning-fallback") === "true",
    );
}
// Leave code fences untouched. Tags can arrive split across streaming chunks.
export function splitReasoning(text: string) {
  let answer = "",
    reasoning = "",
    thinking = false,
    fence = "";
  for (const line of text.split(/(?<=\n)/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && !thinking) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = "";
      answer += line;
      continue;
    }
    if (fence) {
      answer += line;
      continue;
    }
    const parts = line.split(/(`+[^`]*`+|<\/?think>)/i);
    for (const part of parts) {
      if (/^<think>$/i.test(part)) thinking = true;
      else if (/^<\/think>$/i.test(part)) thinking = false;
      else if (thinking) reasoning += part;
      else answer += part;
    }
  }
  // Hide incomplete delimiters during streaming without swallowing regular text.
  answer = answer.replace(/<(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, "");
  reasoning = reasoning.replace(/<\/?(?:t(?:h(?:i(?:n(?:k)?)?)?)?)?$/i, "");
  return { answer: answer.trim(), reasoning: reasoning.trim(), thinking };
}
