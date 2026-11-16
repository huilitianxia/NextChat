import { NextRequest, NextResponse } from "next/server";
import {
  authorize,
  assertAllowedChatModel,
  boundedBody,
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
import {
  fetchWithEffortFallback,
  isReasoningModel,
  normalizeEffort,
} from "../../utils/reasoning";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    await authorize(req);
    let body: any;
    try {
      body = JSON.parse(new TextDecoder().decode(await boundedBody(req)));
    } catch (e) {
      if (e instanceof RequestError) throw e;
      throw new RequestError("无效 JSON");
    }
    assertAllowedChatModel(body.model);
    if (
      !Array.isArray(body.messages) ||
      body.messages.length > 300 ||
      !body.messages.length
    )
      throw new RequestError("消息格式无效");
    if (!checkSecurityPrompt(JSON.stringify(body.messages)).allowed)
      throw new RequestError(SECURITY_BLOCK_MESSAGE);
    const input = body.messages.map((message: any) => {
      if (!["user", "assistant", "system", "developer"].includes(message.role))
        throw new RequestError("消息角色无效");
      if (typeof message.content === "string")
        return { role: message.role, content: message.content };
      if (!Array.isArray(message.content))
        throw new RequestError("消息内容无效");
      return {
        role: message.role,
        content: message.content.map((part: any) => {
          if (part.type === "text" && typeof part.text === "string")
            return {
              type: message.role === "assistant" ? "output_text" : "input_text",
              text: part.text,
            };
          if (
            part.type === "image_url" &&
            message.role === "user" &&
            typeof part.image_url?.url === "string"
          )
            return { type: "input_image", image_url: part.image_url.url };
          throw new RequestError("不支持的消息内容");
        }),
      };
    });
    const attempt = await fetchWithEffortFallback(
      upstreamUrl("responses"),
      {
        method: "POST",
        headers: upstreamHeaders(req, true),
        signal: req.signal,
      },
      {
        model: body.model,
        input,
        tools: [{ type: "web_search" }],
        stream: true,
        store: false,
        ...(isReasoningModel(body.model)
          ? { reasoning: { effort: normalizeEffort(body.reasoning_effort) } }
          : {}),
      },
      true,
    );
    const response = attempt.response;
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.status === 404 ? "endpoint not found" : "",
      }));
      if (unsupported(error, response.status))
        return NextResponse.json(
          {
            fallback: true,
            notice: "当前服务不支持联网检索，已改用普通对话；本次回答未联网。",
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      throw new RequestError(
        `联网服务返回 ${response.status}，请稍后重试。`,
        response.status,
      );
    }
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store, private",
        "X-Accel-Buffering": "no",
        ...(attempt.effective
          ? { "x-nextchat-reasoning-effort": attempt.effective }
          : {}),
        ...(attempt.fallback
          ? { "x-nextchat-reasoning-fallback": "true" }
          : {}),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
