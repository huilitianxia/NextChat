import type { ChatOptions, RequestMessage } from "../client/api";
import { getHeaders } from "../client/api";
import type { WebSource } from "./campus-types";
import { effortPayload, reportEffort } from "./reasoning";
export async function searchChat(
  options: ChatOptions,
  messages: RequestMessage[],
  controller: AbortController,
): Promise<boolean> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: options.config.model,
      messages,
      ...effortPayload(options.config.model, options.config.reasoningEffort),
    }),
    signal: controller.signal,
  });
  if (response.status === 409) {
    const data = await response.json();
    if (data.fallback === true) {
      options.onSearchNotice?.(String(data.notice));
      return false;
    }
  }
  if (!response.ok)
    throw new Error((await response.json()).error || "联网检索失败");
  reportEffort(response, options.onEffort);
  const sources: WebSource[] = [];
  let text = "",
    reasoning = "",
    finished = false;
  const combined = () =>
    reasoning
      ? `<think>${reasoning}${text || finished ? "</think>\n\n" : ""}${text}`
      : text;
  const add = (item: any) => {
    const url = item?.url || item?.url_citation?.url;
    if (
      typeof url === "string" &&
      /^https?:\/\//i.test(url) &&
      !sources.some((s) => s.url === url)
    )
      sources.push({
        url,
        title: String(
          item.title || item.url_citation?.title || new URL(url).hostname,
        ),
      });
  };
  const reader = response.body?.getReader();
  if (!reader) throw new Error("联网服务没有返回内容");
  const decoder = new TextDecoder();
  let buffer = "";
  function event(block: string) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const value = JSON.parse(data);
    if (value.type === "response.output_text.delta") {
      text += value.delta || "";
      options.onUpdate?.(combined(), value.delta || "");
    }
    if (value.type === "response.reasoning_summary_text.delta") {
      reasoning += value.delta || "";
      options.onUpdate?.(combined(), value.delta || "");
    }
    if (value.type === "response.output_text.annotation.added")
      add(value.annotation);
    if (value.type === "error" || value.type === "response.failed")
      throw new Error(
        value.error?.message ||
          value.response?.error?.message ||
          "联网检索失败",
      );
    if (
      value.type === "response.completed" ||
      value.type === "response.incomplete"
    ) {
      const content = (value.response?.output || [])
        .filter((o: any) => o.type === "message")
        .flatMap((o: any) => o.content || []);
      content.forEach((c: any) => (c.annotations || []).forEach(add));
      if (!text)
        text = content
          .filter((c: any) => c.type === "output_text")
          .map((c: any) => c.text || "")
          .join("\n");
      finished = true;
      if (!reasoning)
        reasoning = (value.response?.output || [])
          .filter((item: any) => item.type === "reasoning")
          .flatMap((item: any) => item.summary || [])
          .map((item: any) => item.text || "")
          .join("\n");
      if (value.type === "response.incomplete")
        options.onSearchNotice?.("联网回答被服务端提前截断，可继续追问。");
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        event(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) {
        if (buffer.trim()) event(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!finished) throw new Error("联网连接意外结束，请重试。");
  if (!text.trim()) throw new Error("联网服务未返回文字，请重试。");
  options.onSources?.(sources);
  options.onFinish(combined(), response);
  return true;
}
