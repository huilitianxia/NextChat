import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getConfiguredOpenAIKeys } from "../config/server";
import { ACCESS_CODE_PREFIX } from "../constant";
import {
  CONTAINER_FILE_PATH,
  record,
  simulationImageFormat,
  type SimulationImageFormat,
} from "../utils/python-stream";
import { authorize, RequestError, upstreamHeaders } from "./campus-shared";

export type SimulationImageRef = {
  containerId: string;
  fileId: string;
  format: SimulationImageFormat;
};

export function isContainerFileId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function combinedSignal(...signals: AbortSignal[]) {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
      signal: controller.signal,
    });
  }
  return controller.signal;
}

export async function authorizePythonRequest(request: NextRequest) {
  const authRequest = new NextRequest(request.url, {
    headers: new Headers(request.headers),
  });
  const encoded = authRequest.headers.get("x-nextchat-access-code");
  const legacy = authRequest.headers.get("Authorization");
  await authorize(authRequest);
  const accessCode = (
    encoded !== null
      ? decodeURIComponent(encoded)
      : legacy?.slice(("Bearer " + ACCESS_CODE_PREFIX).length) || ""
  ).trim();
  const headers = upstreamHeaders(authRequest);
  const key = headers.get("Authorization")!.slice("Bearer ".length);
  return { accessCode, key, headers };
}

function signImage(ref: SimulationImageRef, accessCode: string, key: string) {
  return createHmac("sha256", key)
    .update(
      JSON.stringify([
        "nextchat:simulation-image:v1",
        accessCode,
        ref.containerId,
        ref.fileId,
        ref.format,
      ]),
    )
    .digest();
}

export function simulationImageUrl(
  ref: SimulationImageRef,
  accessCode: string,
  key: string,
) {
  const params = new URLSearchParams({
    container_id: ref.containerId,
    file_id: ref.fileId,
    format: ref.format,
    signature: signImage(ref, accessCode, key).toString("base64url"),
  });
  return CONTAINER_FILE_PATH + "?" + params;
}

export function imageAccessKey(
  ref: SimulationImageRef,
  accessCode: string,
  signature: string | null,
) {
  if (!signature || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return;
  const digest = Buffer.from(signature, "base64url");
  return getConfiguredOpenAIKeys().find((key) =>
    timingSafeEqual(digest, signImage(ref, accessCode, key)),
  );
}

export function imageCitation(value: unknown): SimulationImageRef | undefined {
  const item = record(value);
  if (
    item?.type !== "container_file_citation" ||
    !isContainerFileId(item.container_id) ||
    !isContainerFileId(item.file_id) ||
    typeof item.filename !== "string"
  )
    return;
  const format = simulationImageFormat(item.filename.split(".").at(-1) || "");
  if (format && item.filename.includes(".")) {
    return { containerId: item.container_id, fileId: item.file_id, format };
  }
}

type InputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "auto" };
type InputMessage =
  | { role: "system" | "assistant"; content: string }
  | { role: "user"; content: string | InputPart[] };

export function toResponsesInput(messages: unknown): InputMessage[] {
  if (!Array.isArray(messages)) throw new RequestError("对话历史格式无效。");
  const result: InputMessage[] = [];
  for (const value of messages) {
    const { role, content } = record(value) ?? {};
    if (role !== "user" && role !== "assistant" && role !== "system")
      throw new RequestError("对话角色无效。");
    if (typeof content === "string") {
      if (content.trim()) result.push({ role, content });
      continue;
    }
    if (!Array.isArray(content)) throw new RequestError("消息内容格式无效。");
    const parts: InputPart[] = [];
    for (const value of content) {
      const part = record(value);
      if (part?.type === "text" && typeof part.text === "string") {
        if (part.text.trim())
          parts.push({ type: "input_text", text: part.text });
      } else if (part?.type === "image_url") {
        if (role !== "user") continue;
        const url = record(part.image_url)?.url;
        if (
          typeof url !== "string" ||
          !/^(?:https?:\/\/[^\s]+$|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(
            url,
          )
        )
          throw new RequestError("仿真附件需要有效的图片。");
        parts.push({ type: "input_image", image_url: url, detail: "auto" });
      } else {
        throw new RequestError("消息附件格式无效。");
      }
    }
    if (role === "user") {
      if (parts.length) result.push({ role, content: parts });
    } else {
      const text = parts.flatMap((part) =>
        part.type === "input_text" ? [part.text] : [],
      );
      if (text.length) result.push({ role, content: text.join("\n") });
    }
  }
  if (result.at(-1)?.role !== "user")
    throw new RequestError("请先输入仿真问题。");
  return result;
}
