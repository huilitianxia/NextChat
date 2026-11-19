import { NextRequest, NextResponse } from "next/server";
import { POST as search } from "../route";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const SEARCH_DEADLINE_MS = 8000;
const MAX_PREFIX_BYTES = 128 * 1024;

function fallback() {
  return NextResponse.json(
    {
      fallback: true,
      notice: "联网检索暂时不可用，已切换为直接回答；本次回答未联网。",
    },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abort = () => controller.abort();
  const cleanup = () => {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", abort);
  };
  if (req.signal.aborted) return new Response(null, { status: 499 });
  req.signal.addEventListener("abort", abort, { once: true });
  const stopped = new Promise<Response>((resolve) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        resolve(
          req.signal.aborted ? new Response(null, { status: 499 }) : fallback(),
        );
        void reader?.cancel().catch(() => {});
      },
      { once: true },
    );
    timer = setTimeout(abort, SEARCH_DEADLINE_MS);
  });

  async function startSearch() {
    try {
      // The route request may originate outside this Edge module's Request realm.
      const searchRequest = {
        method: req.method,
        headers: Array.from(req.headers),
        body: req.body,
        signal: controller.signal,
        duplex: "half" as const,
      };
      const response = await search(new NextRequest(req.url, searchRequest));
      if (controller.signal.aborted) {
        void response.body?.cancel().catch(() => {});
        return fallback();
      }
      if (!response.ok) {
        cleanup();
        if (
          response.status >= 500 ||
          [404, 408, 429].includes(response.status)
        ) {
          void response.body?.cancel().catch(() => {});
          return fallback();
        }
        return response;
      }
      if (!response.body) return fallback();
      const source = response.body.getReader();
      reader = source;
      const prefix: Uint8Array[] = [];
      const decoder = new TextDecoder();
      let buffer = "";
      let bytes = 0;

      // A response.created event only acknowledges the request. Wait until
      // search completes or the provider starts answering before committing.
      while (bytes < MAX_PREFIX_BYTES) {
        const { done, value } = await source.read();
        if (done) return fallback();
        prefix.push(value);
        bytes += value.byteLength;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        if (
          events.some((event) =>
            /"type"\s*:\s*"(?:error|response\.failed)"/.test(event),
          )
        )
          return fallback();
        if (
          events.some((event) =>
            /"type"\s*:\s*"response\.(?:web_search_call\.completed|output_text\.delta|completed|incomplete)"/.test(
              event,
            ),
          )
        ) {
          clearTimeout(timer);
          let index = 0;
          return new Response(
            new ReadableStream<Uint8Array>({
              async pull(stream) {
                if (index < prefix.length) {
                  stream.enqueue(prefix[index++]);
                  return;
                }
                try {
                  const result = await source.read();
                  if (result.done) {
                    cleanup();
                    stream.close();
                  } else stream.enqueue(result.value);
                } catch (error) {
                  cleanup();
                  stream.error(error);
                }
              },
              cancel() {
                cleanup();
                abort();
              },
            }),
            { headers: response.headers },
          );
        }
      }
      return fallback();
    } catch {
      return fallback();
    }
  }

  const response = await Promise.race([startSearch(), stopped]);
  if (!response.ok) {
    cleanup();
    abort();
  }
  return response;
}
