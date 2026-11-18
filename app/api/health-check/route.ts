import { NextRequest } from "next/server";
import { DEFAULT_CHAT_MODEL } from "../../constant";
import {
  authorize,
  assertAllowedChatModel,
  failure,
  RequestError,
  unsupported,
  upstreamHeaders,
  upstreamUrl,
} from "../campus-shared";
import {
  CAPABILITY_CHECKS,
  CapabilityEvent,
  CapabilityResult,
} from "../../utils/health-check";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// A one-second silent PCM WAV tests the real upload/transcription endpoint.
function sampleAudio() {
  const buffer = new ArrayBuffer(44 + 16000 * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, 32000, true);
  return new Blob([buffer], { type: "audio/wav" });
}

const SAMPLE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXklEQVR4nO3PMQ0AMAzAsPInvYLYYVWKESTzjhsd8KsBrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BbQHKU9LC7/CP1AAAAABJRU5ErkJggg==";

async function request(
  req: NextRequest,
  path: string,
  body: object | FormData,
  signal: AbortSignal,
) {
  const isForm = body instanceof FormData;
  const response = await fetch(upstreamUrl(path), {
    method: "POST",
    headers: upstreamHeaders(req, !isForm),
    body: isForm ? body : JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function requireSuccess(response: Response) {
  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? "请检查服务密钥或模型权限。"
        : response.status === 429
        ? "请检查额度或限流状态。"
        : "请检查上游是否支持此接口。";
    // Do not echo upstream error bodies: gateways may include credentials/URLs.
    throw new RequestError(
      `上游返回 HTTP ${response.status}，${hint}`,
      response.status,
    );
  }
}

async function probe(
  req: NextRequest,
  id: CapabilityResult["id"],
  signal: AbortSignal,
) {
  if (id === "chat") {
    assertAllowedChatModel(DEFAULT_CHAT_MODEL);
    const { response, data } = await request(
      req,
      "chat/completions",
      {
        model: DEFAULT_CHAT_MODEL,
        messages: [{ role: "user", content: "Reply with OK." }],
        // The default supports low effort, not 'none'. Leave room for reasoning.
        reasoning_effort: "low",
        max_completion_tokens: 1024,
        stream: false,
      },
      signal,
    );
    requireSuccess(response);
    if (
      !data?.choices?.some(
        (choice: any) =>
          typeof choice.message?.content === "string" &&
          choice.message.content.trim().length > 0,
      )
    )
      throw new RequestError("接口未返回有效的对话结果。", 502);
    return {
      status: "ok" as const,
      model: DEFAULT_CHAT_MODEL,
      message: "对话请求成功。",
    };
  }
  if (id === "audio") {
    const form = new FormData();
    form.set("model", "whisper-1");
    form.set("file", sampleAudio(), "health-check.wav");
    form.set("response_format", "json");
    const { response, data } = await request(
      req,
      "audio/transcriptions",
      form,
      signal,
    );
    requireSuccess(response);
    if (typeof data?.text !== "string")
      throw new RequestError("接口未返回有效的转写结果。", 502);
    return {
      status: "ok" as const,
      model: "whisper-1",
      message: "测试音频上传与转写接口成功。",
    };
  }
  if (id === "search") {
    assertAllowedChatModel(DEFAULT_CHAT_MODEL);
    const { response, data } = await request(
      req,
      "responses",
      {
        model: DEFAULT_CHAT_MODEL,
        input:
          "Use web search once to find the official OpenAI homepage. Reply with its URL.",
        tools: [{ type: "web_search", search_context_size: "low" }],
        tool_choice: "required",
        max_tool_calls: 1,
        reasoning: { effort: "low" },
        max_output_tokens: 1024,
        store: false,
        stream: false,
      },
      signal,
    );
    requireSuccess(response);
    if (
      !Array.isArray(data?.output) ||
      !data.output.some(
        (item: any) =>
          item.type === "web_search_call" && item.status === "completed",
      )
    )
      throw new RequestError(
        "接口已响应，但未确认执行 web_search；联网能力尚未通过。",
        502,
      );
    return {
      status: "ok" as const,
      model: `${DEFAULT_CHAT_MODEL} · web_search`,
      message: "已确认一次真实联网搜索完成。",
    };
  }
  const models = [
    ...new Set([
      "gpt-image-2.6-sunburst",
      process.env.IMAGE_EDIT_FALLBACK_MODEL || "gpt-image-2.5-flare",
    ]),
  ];
  for (let i = 0; i < models.length; i++) {
    const form = new FormData();
    form.set("model", models[i]);
    form.set(
      "image",
      new Blob([Uint8Array.from(atob(SAMPLE_PNG), (c) => c.charCodeAt(0))], {
        type: "image/png",
      }),
      "health-check.png",
    );
    form.set(
      "prompt",
      "Return a plain white square, keeping the input's simple composition.",
    );
    form.set("n", "1");
    form.set("size", "1024x1024");
    form.set("quality", "low");
    const { response, data } = await request(req, "images/edits", form, signal);
    if (
      !response.ok &&
      i + 1 < models.length &&
      unsupported(data, response.status)
    )
      continue;
    requireSuccess(response);
    if (
      typeof data?.data?.[0]?.b64_json !== "string" ||
      !/^[A-Za-z0-9+/=]+$/.test(data.data[0].b64_json)
    )
      throw new RequestError("接口未返回有效的图片数据。", 502);
    return {
      status: i ? ("fallback" as const) : ("ok" as const),
      model: models[i],
      message: i
        ? "主模型不支持，后备模型图片编辑成功。"
        : "主模型图片编辑成功。",
    };
  }
  throw new RequestError("图片模型不可用。", 502);
}

export async function POST(req: NextRequest) {
  try {
    await authorize(req);
    const encoder = new TextEncoder();
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    req.signal.addEventListener("abort", onAbort, { once: true });
    if (req.signal.aborted) abort.abort();
    let active = true;
    let heartbeat: ReturnType<typeof setInterval>;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: CapabilityEvent) => {
          if (active && !abort.signal.aborted)
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        send({ type: "pending" });
        heartbeat = setInterval(() => send({ type: "pending" }), 15000);
        try {
          await Promise.allSettled(
            CAPABILITY_CHECKS.map(async (check) => {
              const started = Date.now();
              const checkAbort = new AbortController();
              const cancel = () => checkAbort.abort();
              abort.signal.addEventListener("abort", cancel, { once: true });
              if (abort.signal.aborted) cancel();
              let timedOut = false;
              const timer = setTimeout(
                () => {
                  timedOut = true;
                  cancel();
                },
                check.id === "image" ? 150000 : 60000,
              );
              let result: CapabilityResult;
              try {
                result = {
                  id: check.id,
                  ...(await probe(req, check.id, checkAbort.signal)),
                  durationMs: Date.now() - started,
                };
              } catch (error) {
                result = {
                  id: check.id,
                  status: "error",
                  model: check.model,
                  durationMs: Date.now() - started,
                  message: timedOut
                    ? "测试超时，请稍后重试。"
                    : error instanceof RequestError
                    ? error.message
                    : "无法连接上游，请检查服务地址或稍后重试。",
                  ...(error instanceof RequestError
                    ? { httpStatus: error.status }
                    : {}),
                };
              } finally {
                clearTimeout(timer);
                abort.signal.removeEventListener("abort", cancel);
              }
              send({ type: "result", result });
            }),
          );
          send({ type: "done", checkedAt: new Date().toISOString() });
        } finally {
          clearInterval(heartbeat);
          req.signal.removeEventListener("abort", onAbort);
          if (active) {
            active = false;
            controller.close();
          }
        }
      },
      cancel() {
        active = false;
        clearInterval(heartbeat);
        abort.abort();
        req.signal.removeEventListener("abort", onAbort);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store, private",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
