import type { NextRequest } from "next/server";
import { getServerSideConfig } from "../../config/server";
import {
  readPythonEvents,
  record,
  type PythonStreamEvent,
} from "../../utils/python-stream";
import {
  assertAllowedChatModel,
  boundedBody,
  failure,
  RequestError,
  upstreamUrl,
} from "../campus-shared";
import {
  authorizePythonRequest,
  combinedSignal,
  imageCitation,
  simulationImageUrl,
  toResponsesInput,
  type SimulationImageRef,
} from "../python-shared";

export const runtime = "nodejs";
export const maxDuration = 60;

const TIMEOUT = "Python 仿真超过本次等待时间。请重试，或缩小仿真规模。";
const INTERRUPTED = "Python 仿真连接中断，请点击重新生成。";
const INSTRUCTIONS =
  "仅在需要复杂数值计算、FFT、SciPy 仿真、精确绘图，或用户明确要求运行 Python 时使用 Code Interpreter。绘图时用清晰白底、坐标轴和单位，将成图保存为 /mnt/data 下的 PNG、JPG 或 SVG 文件，并在最终答复中引用输出文件，便于网页展示和下载。";

function itemAnnotations(value: unknown) {
  const content = record(value)?.content;
  return Array.isArray(content)
    ? content.flatMap((part) => array(record(part)?.annotations))
    : [];
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function eventAnnotations(event: Record<string, unknown>) {
  switch (event.type) {
    case "response.output_text.annotation.added":
      return [event.annotation];
    case "response.content_part.done":
      return array(record(event.part)?.annotations);
    case "response.output_item.done":
      return itemAnnotations(event.item);
    case "response.completed":
    case "response.incomplete":
      return array(record(event.response)?.output).flatMap(itemAnnotations);
    default:
      return [];
  }
}

function streamSimulation(
  body: ReadableStream<Uint8Array>,
  access: Awaited<ReturnType<typeof authorizePythonRequest>>,
  timeout: AbortSignal,
  abort: AbortController,
) {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PythonStreamEvent) =>
        controller.enqueue(
          encoder.encode("data: " + JSON.stringify(event) + "\n\n"),
        );
      const keepAlive = () =>
        controller.enqueue(encoder.encode(": python-chat\n\n"));
      keepAlive();
      const timer = setInterval(keepAlive, 10_000);
      const images = new Map<string, SimulationImageRef>();
      const sendImages = () => {
        for (const ref of images.values()) {
          const url = simulationImageUrl(ref, access.accessCode, access.key);
          send({
            type: "image",
            url,
            text: "\n\n![仿真图表](" + url + ")\n\n",
          });
        }
      };
      try {
        for await (const event of readPythonEvents(body)) {
          if (cancelled) return;
          for (const value of eventAnnotations(event)) {
            const ref = imageCitation(value);
            if (ref) images.set(ref.containerId + ":" + ref.fileId, ref);
          }
          if (
            (event.type === "response.output_text.delta" ||
              event.type === "response.refusal.delta") &&
            typeof event.delta === "string"
          )
            send({ type: "delta", text: event.delta });
          if (event.type === "response.completed") {
            sendImages();
            send({ type: "done" });
            return;
          }
          if (event.type === "response.incomplete") {
            sendImages();
            send({
              type: "error",
              message: "Python 仿真未完成，请缩小规模后重试。",
            });
            return;
          }
          if (event.type === "response.failed" || event.type === "error") {
            send({
              type: "error",
              message:
                "Python 仿真失败，请确认当前模型支持 Code Interpreter 后重试。",
            });
            return;
          }
        }
        if (!cancelled) send({ type: "error", message: INTERRUPTED });
      } catch {
        if (!cancelled)
          send({
            type: "error",
            message: timeout.aborted ? TIMEOUT : INTERRUPTED,
          });
      } finally {
        clearInterval(timer);
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      abort.abort();
    },
  });
}

export async function POST(req: NextRequest) {
  const timeout = AbortSignal.timeout(55_000);
  const abort = new AbortController();
  try {
    const access = await authorizePythonRequest(req);
    let body: Record<string, unknown> | undefined;
    const bytes = await boundedBody(req);
    try {
      body = record(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      throw new RequestError("无效 JSON。");
    }
    if (!body) throw new RequestError("无效仿真请求。");
    const model = body.model ?? getServerSideConfig().defaultModel;
    const modelId = typeof model === "string" ? model.trim() : model;
    assertAllowedChatModel(modelId);
    const input = toResponsesInput(body.messages);
    access.headers.set("Content-Type", "application/json");
    access.headers.set("Accept", "text/event-stream");
    const upstream = await fetch(upstreamUrl("responses"), {
      method: "POST",
      headers: access.headers,
      body: JSON.stringify({
        model: modelId,
        input,
        instructions: INSTRUCTIONS,
        stream: true,
        store: false,
        tools: [{ type: "code_interpreter", container: { type: "auto" } }],
        tool_choice: "auto",
      }),
      redirect: "error",
      cache: "no-store",
      signal: combinedSignal(req.signal, timeout, abort.signal),
    });
    if (
      !upstream.ok ||
      !upstream.body ||
      !upstream.headers.get("Content-Type")?.includes("text/event-stream")
    ) {
      void upstream.body?.cancel().catch(() => {});
      if (upstream.status === 429)
        throw new RequestError("Python 仿真请求过于频繁，请稍后重试。", 429);
      if (upstream.status === 504) throw new RequestError(TIMEOUT, 504);
      throw new RequestError(
        "Python 仿真服务不可用。请检查模型、API Key 和 BASE_URL 是否支持 Responses API 与 Code Interpreter。",
        502,
      );
    }
    return new Response(
      streamSimulation(upstream.body, access, timeout, abort),
      {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      },
    );
  } catch (error) {
    return failure(timeout.aborted ? new RequestError(TIMEOUT, 504) : error);
  }
}
