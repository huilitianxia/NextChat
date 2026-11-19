import {
  CHAT_STREAM_EFFORT,
  CHAT_STREAM_ERROR,
  GATEWAY_TIMEOUT_MESSAGE,
  isGatewayTimeout,
} from "../utils/chat-stream-protocol";
import type { ReasoningEffort } from "../utils/reasoning";

const UPSTREAM_TIMEOUT_MS = 240_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const RETRY_DELAYS_MS = [1000, 2000];
const RETRYABLE_STATUS = [429, 502, 503];

type Upstream = {
  response: Response;
  effective?: ReasoningEffort;
  fallback?: boolean;
};

async function gatewayTimeoutBeforeRetry(response: Response) {
  if (
    isGatewayTimeout(
      response.status,
      response.headers.get("x-vercel-error") ?? "",
    )
  )
    return true;
  if (response.status !== 502 || !response.body) return false;
  const reader = response.clone().body!.getReader();
  const decoder = new TextDecoder();
  const stopReading = () => {
    void reader.cancel().catch(() => {});
  };
  const timer = setTimeout(stopReading, 250);
  let prefix = "";
  try {
    while (prefix.length < 4096) {
      const { done, value } = await reader.read();
      if (done) break;
      prefix += decoder.decode(value.subarray(0, 4096 - prefix.length), {
        stream: true,
      });
      if (isGatewayTimeout(undefined, prefix)) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    stopReading();
  }
}

function waitForRetry(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}

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

  async function connect() {
    const signal = upstream.signal;
    let attempt = await openUpstream(signal);
    for (const delay of RETRY_DELAYS_MS) {
      if (!RETRYABLE_STATUS.includes(attempt.response.status)) break;
      if (await gatewayTimeoutBeforeRetry(attempt.response)) break;
      void attempt.response.body?.cancel().catch(() => {});
      await waitForRetry(delay, signal);
      attempt = await openUpstream(signal);
    }
    return attempt;
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
          const { response, effective, fallback } = await connect();

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
