import { ApiPath } from "@/app/constant";
import { NextRequest } from "next/server";
import { handle as openaiHandler } from "../../openai";
import { handle as unavailable } from "../../proxy";

async function handle(
  req: NextRequest,
  { params }: { params: { provider: string; path: string[] } },
) {
  // Only the authenticated OpenAI handler can reach the server-configured
  // upstream. Unknown providers must never become a general-purpose proxy.
  if (`/api/${params.provider}` !== ApiPath.OpenAI) {
    return unavailable();
  }
  return openaiHandler(req, { params });
}

export const GET = handle;
export const POST = handle;
export const runtime = "edge";
