import type { RequestMessage, MultimodalContent } from "../client/api";
export const CONTEXT_WINDOWS = [1000000, 256000] as const;
export type ContextWindow = (typeof CONTEXT_WINDOWS)[number];
export const contextWindow = (n?: number): ContextWindow =>
  n === 256000 ? 256000 : 1000000;
export function textTokenEstimate(text: string) {
  let units = 0;
  for (const c of text) {
    const code = c.codePointAt(0)!;
    units +=
      code < 128 ? (/[A-Za-z]/.test(c) ? 0.25 : 0.5) : code > 0xffff ? 2 : 1.5;
  }
  return Math.ceil(units);
}
export function contentTokenEstimate(content: string | MultimodalContent[]) {
  return typeof content === "string"
    ? textTokenEstimate(content)
    : content.reduce(
        (n, p) =>
          n + (p.type === "image_url" ? 1536 : textTokenEstimate(p.text || "")),
        0,
      );
}
export function tokenGauge(total: number, windowSize: number) {
  if (!Number.isFinite(total) || total < 0) throw new Error("Token 估算无效。");
  const limit = contextWindow(windowSize),
    fraction = total / limit;
  return {
    limit,
    total,
    percent: fraction * 100,
    width: Math.min(100, fraction * 100),
    tone: fraction < 0.65 ? "green" : fraction <= 0.85 ? "amber" : "coral",
    shouldCompact: fraction >= 0.75,
    exceeded: fraction > 1,
  } as const;
}
export function tokenLabel(value: number) {
  return value >= 1000
    ? (value / 1000).toFixed(1) + "k"
    : String(Math.ceil(value));
}
function textParts(text: string) {
  const at = text.indexOf("[附件：");
  return at < 0
    ? { text: textTokenEstimate(text), files: 0 }
    : {
        text: textTokenEstimate(text.slice(0, at)),
        files: textTokenEstimate(text.slice(at)),
      };
}
export function estimateContext(
  history: RequestMessage[],
  draft: RequestMessage,
  specialist = "",
  rag = "",
) {
  let system = 0,
    historyTokens = 0,
    filesRag = rag ? textTokenEstimate(rag) : 0,
    imageCount = 0;
  if (specialist || rag)
    system +=
      4 + textTokenEstimate(specialist + (specialist && rag ? "\n\n" : ""));
  for (const message of [...history, draft]) {
    if (message.role === "system") {
      system += 4 + contentTokenEstimate(message.content);
      continue;
    }
    historyTokens += 4;
    const parts =
      typeof message.content === "string"
        ? [{ type: "text", text: message.content } as MultimodalContent]
        : message.content;
    for (const part of parts) {
      if (part.type === "image_url") {
        filesRag += 1536;
        imageCount++;
      } else {
        const split = textParts(part.text || "");
        historyTokens += split.text;
        filesRag += split.files;
      }
    }
  }
  system += 2;
  return {
    system,
    history: historyTokens,
    filesRag,
    imageCount,
    total: system + historyTokens + filesRag,
  };
}
export function composeRequest(
  history: RequestMessage[],
  draft: RequestMessage,
  specialist = "",
  rag = "",
): RequestMessage[] {
  const instruction = [specialist, rag].filter(Boolean).join("\n\n");
  return [
    ...(instruction ? [{ role: "system" as const, content: instruction }] : []),
    ...history,
    draft,
  ];
}
