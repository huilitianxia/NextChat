import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth";
import {
  assertAllowedChatModel,
  boundedBody,
  failure,
  RequestError,
  upstreamHeaders,
  upstreamUrl,
} from "@/app/api/campus-shared";
import { chatEventStream } from "@/app/api/chat-event-stream";
import { handle as legacyOpenaiHandler } from "@/app/api/openai";
import { GPT62_MODEL_REGEX, ModelProvider, OpenaiPath } from "@/app/constant";
import { CHAT_STREAM_HEADER } from "@/app/utils/chat-stream-protocol";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import {
  fetchWithEffortFallback,
  isReasoningModel,
  normalizeEffort,
} from "@/app/utils/reasoning";

export const runtime = "edge";

export function GET(req: NextRequest) {
  return legacyOpenaiHandler(req, {
    params: { path: OpenaiPath.ChatPath.split("/") },
  });
}

export async function POST(req: NextRequest) {
  // Older clients still expect the original HTTP status and response headers.
  if (req.headers.get(CHAT_STREAM_HEADER) !== "1") return GET(req);

  try {
    const result = await auth(req, ModelProvider.GPT);
    if (result.error) return NextResponse.json(result, { status: 401 });

    const bytes = await boundedBody(req);
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new RequestError("无效 JSON");
    }
    const model = payload?.model;
    assertAllowedChatModel(model);

    payload.stream = true;
    const modelName = (model as string).trim();
    if (/^gpt-6(?:[.-]|$)/i.test(modelName)) delete payload.temperature;
    if (GPT62_MODEL_REGEX.test(modelName)) {
      delete payload.top_p;
      delete payload.logprobs;
      delete payload.top_logprobs;
    }
    const useReasoningEffort =
      isReasoningModel(modelName) && payload.reasoning_effort !== undefined;
    if (useReasoningEffort)
      payload.reasoning_effort = normalizeEffort(payload.reasoning_effort);

    const url = cloudflareAIGatewayUrl(upstreamUrl("chat/completions"));
    const headers = upstreamHeaders(req, true);
    headers.set("Accept", "text/event-stream");
    headers.set("Cache-Control", "no-store");

    return chatEventStream(req.signal, async (signal) => {
      const init: RequestInit = {
        method: "POST",
        headers,
        signal,
        redirect: "manual",
      };
      return useReasoningEffort
        ? fetchWithEffortFallback(url, init, payload)
        : {
            response: await fetch(url, {
              ...init,
              body: JSON.stringify(payload),
            }),
          };
    });
  } catch (error) {
    return failure(error);
  }
}
