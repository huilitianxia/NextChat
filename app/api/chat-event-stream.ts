import {
  CHAT_STREAM_EFFORT,
  CHAT_STREAM_ERROR,
  GATEWAY_TIMEOUT_MESSAGE,
  isGatewayTimeout,
} from "../utils/chat-stream-protocol";
import type { ReasoningEffort } from "../utils/reasoning";

const UPSTREAM_TIMEOUT_MS = 240_000;
const HEARTBEAT_INTERVAL_MS = 10_000;

type Upstream = {
  response: Response;
  effective?: ReasoningEffort;
  fallback?: boolean;
};

export function chatEventStream(
  requestSignal: AbortSignal,
  openUpstream: (signal: AbortSignal) => Promise<Upstream>,
) {
  const upstream = new AbortController();
  const encoder = new TextEncoder();
  let output: ReadableStreamDefaultController<Uint8Array>;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timeout: ReturnType<typeof setTimeout>;
  let heartbeat: ReturnType<typeof setInterval>;
  let closed = false;
  let atLineStart = true;

  function enqueue(text: string) {
    output.enqueue(encoder.encode(text));
  }

  function event(name: string, data: object) {
    enqueue("event: " + name + "\ndata: " + JSON.stringify(data) + "\n\n");
  }

  function stop(closeBody: boolean) {
    if (closed) return;
    closed = true;
    clearTimeout(timeout);
    clearInterval(heartbeat);
    requestSignal.removeEventListener("abort", onAbort);
    if (closeBody) output.close();
    upstream.abort();
    void reader?.cancel().catch(() => {});
  }

  function onAbort() {
    stop(true);
  }

  function fail(status: number, message: string) {
    if (closed) return;
    // An upstream chunk may have ended in the middle of an SSE field.
    enqueue("\n\n");
    event(CHAT_STREAM_ERROR, { status, message });
    stop(true);
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
      if (requestSignal.aborted) {
        stop(true);
        return;
      }

      enqueue(": connected\n\n");
      heartbeat = setInterval(() => {
        // A comment can go between complete lines without dispatching a
        // partial event or changing the upstream payload.
        if (atLineStart && (output.desiredSize ?? 0) > 0)
          enqueue(": keep-alive\n");
      }, HEARTBEAT_INTERVAL_MS);
      timeout = setTimeout(
        () => fail(504, GATEWAY_TIMEOUT_MESSAGE),
        UPSTREAM_TIMEOUT_MS,
      );
      requestSignal.addEventListener("abort", onAbort, { once: true });
    },
    async pull() {
      if (closed) return;

      try {
        if (!reader) {
          const { response, effective, fallback } = await openUpstream(
            upstream.signal,
          );

          if (closed) {
            void response.body?.cancel().catch(() => {});
            return;
          }

          const timeoutHeader = response.headers.get("x-vercel-error") ?? "";
          if (isGatewayTimeout(response.status, timeoutHeader)) {
            void response.body?.cancel().catch(() => {});
            fail(504, GATEWAY_TIMEOUT_MESSAGE);
            return;
          }

          const contentType = response.headers.get("content-type");
          if (
            !response.ok ||
            !response.body ||
            !contentType?.startsWith("text/event-stream")
          ) {
            if (
              isGatewayTimeout(undefined, await response.text().catch(() => ""))
            ) {
              fail(504, GATEWAY_TIMEOUT_MESSAGE);
              return;
            }
            fail(
              response.ok ? 502 : response.status,
              response.ok
                ? "模型服务未返回流式响应，请重试。"
                : "模型服务返回 " + response.status + "，请稍后重试。",
            );
            return;
          }

          if (effective) event(CHAT_STREAM_EFFORT, { effective, fallback });
          reader = response.body.getReader();
        }

        const { done, value } = await reader.read();
        if (closed) return;
        if (done) {
          reader.releaseLock();
          reader = undefined;
          stop(true);
        } else {
          if (value.length) atLineStart = value[value.length - 1] === 10;
          output.enqueue(value);
        }
      } catch {
        fail(502, "模型服务连接中断，请重试。");
      }
    },
    cancel() {
      stop(false);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
