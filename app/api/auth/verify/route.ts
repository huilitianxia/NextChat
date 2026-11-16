import { NextRequest, NextResponse } from "next/server";
import {
  getFriendAccessConfig,
  matchFriendProfile,
  MAX_ACCESS_CODE_LENGTH,
  identityIdForCode,
} from "@/app/config/friend-profiles";

export const runtime = "edge";
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 4096;
const response = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" },
  });

export async function POST(req: NextRequest) {
  if (
    req.headers.get("content-type")?.split(";")[0].trim() !== "application/json"
  ) {
    return response({ error: "请使用 JSON 提交访问密码" }, 415);
  }
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return response({ error: "请求内容过长" }, 413);
  }
  // Bound the actual stream as well; content-length is not a trusted limit.
  const reader = req.body?.getReader();
  if (!reader) return response({ error: "请输入访问密码" }, 400);
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return response({ error: "请求内容过长" }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      !("code" in body) ||
      typeof body.code !== "string" ||
      body.code.length > MAX_ACCESS_CODE_LENGTH
    ) {
      return response({ error: "访问密码格式不正确" }, 400);
    }
    const config = getFriendAccessConfig();
    if (!config.valid)
      return response({ error: "访问配置有误，请联系管理员" }, 503);
    const profile = await matchFriendProfile(body.code, config);
    if (!profile) return response({ error: "访问密码不正确或已失效" }, 401);
    // Return only this identity, never codes, hashes, or the full profile table.
    return response({
      ...profile,
      identityId: await identityIdForCode(body.code),
    });
  } catch {
    return response({ error: "访问密码格式不正确" }, 400);
  } finally {
    reader.releaseLock();
  }
}
