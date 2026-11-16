import { NextRequest } from "next/server";
import {
  authorize,
  boundedForm,
  failure,
  RequestError,
  unsupported,
  upstreamHeaders,
  upstreamUrl,
} from "../campus-shared";
import {
  checkSecurityPrompt,
  SECURITY_BLOCK_MESSAGE,
} from "../../utils/security-guard";
export const runtime = "edge";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    await authorize(req);
    const form = await boundedForm(req),
      image = form.get("image"),
      mask = form.get("mask"),
      prompt = form.get("prompt");
    if (
      !(image instanceof Blob) ||
      !image.size ||
      !["image/png", "image/jpeg", "image/webp"].includes(image.type)
    )
      throw new RequestError("请上传 PNG、JPEG 或 WebP 图片");
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 8000)
      throw new RequestError("请填写 1–8,000 字的修改要求");
    if (!checkSecurityPrompt(prompt).allowed)
      throw new RequestError(SECURITY_BLOCK_MESSAGE, 400);
    if (mask && (!(mask instanceof Blob) || mask.type !== "image/png"))
      throw new RequestError("蒙版必须是 PNG 图片");
    const models = [
      ...new Set([
        "gpt-image-2.6-sunburst",
        process.env.IMAGE_EDIT_FALLBACK_MODEL || "gpt-image-2.5-flare",
      ]),
    ];
    // Return a stream immediately; image JSON can exceed Vercel's buffered response cap.
    const encoder = new TextEncoder();
    const upstreamAbort = new AbortController();
    const abortUpstream = () => upstreamAbort.abort();
    req.signal.addEventListener("abort", abortUpstream, { once: true });
    if (req.signal.aborted) upstreamAbort.abort();
    let active = true;
    let heartbeat: ReturnType<typeof setInterval>;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (value: object) => {
          if (active)
            controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        };
        heartbeat = setInterval(() => {
          try {
            send({ type: "pending" });
          } catch {
            active = false;
          }
        }, 15000);
        try {
          send({ type: "pending" });
          for (let i = 0; i < models.length; i++) {
            if (req.signal.aborted) throw new Error("已取消");
            const input = new FormData();
            input.set("model", models[i]);
            input.set(
              "image",
              image,
              image.type === "image/jpeg" ? "original.jpg" : "original.png",
            );
            input.set("prompt", prompt);
            input.set("n", "1");
            input.set("size", "auto");
            if (mask instanceof Blob) input.set("mask", mask, "mask.png");
            const response = await fetch(upstreamUrl("images/edits"), {
              method: "POST",
              headers: upstreamHeaders(req),
              body: input,
              signal: upstreamAbort.signal,
            });
            const data = await response.json();
            if (!response.ok) {
              if (i + 1 < models.length && unsupported(data, response.status))
                continue;
              throw new Error(
                `图片服务返回 ${response.status}，请检查模型权限或修改要求。`,
              );
            }
            const b64 = data.data?.[0]?.b64_json;
            if (typeof b64 !== "string" || !/^[A-Za-z0-9+/=]+$/.test(b64))
              throw new Error("图片服务没有返回可下载的图像数据。");
            send({
              type: "result",
              model: models[i],
              image: `data:image/png;base64,${b64}`,
            });
            return;
          }
        } catch (error) {
          send({ type: "error", error: (error as Error).message });
        } finally {
          clearInterval(heartbeat);
          req.signal.removeEventListener("abort", abortUpstream);
          if (active) {
            active = false;
            controller.close();
          }
        }
      },
      cancel() {
        active = false;
        clearInterval(heartbeat);
        upstreamAbort.abort();
        req.signal.removeEventListener("abort", abortUpstream);
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
