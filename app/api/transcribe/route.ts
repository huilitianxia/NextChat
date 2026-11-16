import { NextRequest, NextResponse } from "next/server";
import {
  authorize,
  boundedForm,
  failure,
  RequestError,
  upstreamHeaders,
  upstreamUrl,
} from "../campus-shared";
export const runtime = "edge";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    await authorize(req);
    const form = await boundedForm(req),
      file = form.get("file");
    if (!(file instanceof Blob) || !file.size || file.size > 3900000)
      throw new RequestError("音频片段无效或过大，请重新分段。", 413);
    const name = (file as File).name || "audio.wav";
    if (!/\.(wav|mp3|m4a|webm|mp4|mpeg|mpga)$/i.test(name))
      throw new RequestError("不支持的音频格式");
    const upstream = new FormData();
    upstream.set("file", file, name);
    upstream.set("model", "whisper-1");
    upstream.set("response_format", "json");
    const response = await fetch(upstreamUrl("audio/transcriptions"), {
      method: "POST",
      headers: upstreamHeaders(req),
      body: upstream,
      signal: req.signal,
    });
    if (!response.ok)
      throw new RequestError(
        `音频转写服务返回 ${response.status}，请检查服务配置或稍后重试。`,
        response.status,
      );
    const data = await response.json();
    if (typeof data.text !== "string")
      throw new RequestError("转写服务没有返回文本", 502);
    return NextResponse.json(
      { text: data.text },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    return failure(error);
  }
}
