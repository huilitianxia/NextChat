import { NextRequest } from "next/server";
import { getServerSideConfig } from "../config/server";
import {
  getFriendAccessConfig,
  matchFriendProfile,
} from "../config/friend-profiles";
import { ACCESS_CODE_PREFIX, ModelProvider } from "../constant";

export async function auth(req: NextRequest, modelProvider: ModelProvider) {
  const config = getFriendAccessConfig();
  if (!config.valid) return { error: true, msg: "访问配置有误，请联系管理员" };

  // Only the administrator's OpenAI-compatible endpoint and API key are used.
  if (
    modelProvider !== ModelProvider.GPT ||
    ["api-key", "x-api-key", "x-goog-api-key"].some((name) =>
      req.headers.has(name),
    )
  ) {
    return { error: true, msg: "此站点仅支持管理员配置的模型服务" };
  }
  let accessCode = "";
  const encodedCode = req.headers.get("x-nextchat-access-code");
  const authorization = req.headers.get("Authorization") ?? "";
  if (
    authorization &&
    !authorization.startsWith(`Bearer ${ACCESS_CODE_PREFIX}`)
  ) {
    return { error: true, msg: "不支持使用个人 API Key 访问" };
  }
  if (encodedCode !== null) {
    try {
      accessCode = decodeURIComponent(encodedCode);
    } catch {
      return { error: true, msg: "访问密码格式不正确" };
    }
  } else if (authorization) {
    // Keep the original CODE bearer format compatible with older clients.
    accessCode = authorization.slice(`Bearer ${ACCESS_CODE_PREFIX}`.length);
  }
  if (!(await matchFriendProfile(accessCode, config))) {
    return { error: true, msg: "访问密码不正确或已失效，请重新登录" };
  }
  const systemApiKey = getServerSideConfig().apiKey;
  if (!systemApiKey) return { error: true, msg: "管理员尚未配置模型服务" };
  req.headers.delete("x-nextchat-access-code");
  req.headers.set("Authorization", `Bearer ${systemApiKey}`);
  return { error: false };
}
