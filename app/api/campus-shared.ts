import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";
import { ModelProvider, ServiceProvider } from "../constant";
import { getServerSideConfig } from "../config/server";
import { isModelNotavailableInServer } from "../utils/model";

export const MAX_CAMPUS_BODY = 4 * 1024 * 1024;
export class RequestError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const failure = (error: unknown) =>
  NextResponse.json(
    {
      error:
        error instanceof RequestError
          ? error.message
          : "处理失败，请稍后重试。",
    },
    {
      status: error instanceof RequestError ? error.status : 502,
      headers: { "Cache-Control": "no-store" },
    },
  );
export async function authorize(req: NextRequest) {
  const result = await auth(req, ModelProvider.GPT);
  if (result.error) throw new RequestError(result.msg || "请重新登录", 401);
}
export async function boundedBody(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > MAX_CAMPUS_BODY)
    throw new RequestError("单次请求超过 4 MiB，请先在浏览器分段或压缩。", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError("请求内容为空");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_CAMPUS_BODY) {
        await reader.cancel();
        throw new RequestError("单次请求超过 4 MiB", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}
export async function boundedForm(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new RequestError("请使用文件表单上传", 415);
  try {
    return await new Response(await boundedBody(req), {
      headers: { "Content-Type": req.headers.get("content-type")! },
    }).formData();
  } catch (e) {
    if (e instanceof RequestError) throw e;
    throw new RequestError("文件表单无效");
  }
}
export function upstreamUrl(path: string) {
  let base = getServerSideConfig().baseUrl || "https://api.openai.com";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return `${base.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/${path}`;
}
export function upstreamHeaders(req: NextRequest, json = false) {
  const headers = new Headers({
    Authorization: req.headers.get("Authorization")!,
    ...(json ? { "Content-Type": "application/json" } : {}),
  });
  const org = getServerSideConfig().openaiOrgId;
  if (org) headers.set("OpenAI-Organization", org);
  return headers;
}
export function assertAllowedChatModel(model: unknown) {
  if (typeof model !== "string" || !model.trim() || model.length > 100)
    throw new RequestError("模型参数无效");
  const config = getServerSideConfig();
  if (
    config.customModels &&
    isModelNotavailableInServer(config.customModels, model, [
      ServiceProvider.OpenAI,
      ServiceProvider.Azure,
      model,
    ])
  )
    throw new RequestError("该模型不在管理员允许列表中", 403);
}
export function unsupported(error: any, status: number) {
  if (![400, 404, 405, 422, 501].includes(status)) return false;
  const code = String(error?.error?.code || error?.code || ""),
    message = String(error?.error?.message || error?.message || "");
  return (
    /model_not_found|unsupported_(?:model|parameter|value)|unknown_model/.test(
      code,
    ) ||
    /(?:model|endpoint|route|web.?search|tool).{0,80}(?:not found|not supported|unsupported|does not exist|unknown)|(?:unsupported|unknown).{0,40}(?:model|tool|endpoint)|cannot (?:post|find).{0,40}responses/i.test(
      message,
    ) ||
    status === 405 ||
    status === 501
  );
}
