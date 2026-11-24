import type { NextRequest } from "next/server";
import {
  SIMULATION_IMAGE_TYPES,
  simulationImageFormat,
} from "../../utils/python-stream";
import { failure, RequestError, upstreamUrl } from "../campus-shared";
import {
  authorizePythonRequest,
  combinedSignal,
  imageAccessKey,
  isContainerFileId,
} from "../python-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const supportedTypes = new Set<string>(Object.values(SIMULATION_IMAGE_TYPES));

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const containerId = params.get("container_id");
    const fileId = params.get("file_id");
    const format = simulationImageFormat(params.get("format") ?? "png");
    if (
      !isContainerFileId(containerId) ||
      !isContainerFileId(fileId) ||
      !format
    )
      throw new RequestError("仿真图片参数无效。");

    const { accessCode, headers } = await authorizePythonRequest(req);
    const key = imageAccessKey(
      { containerId, fileId, format },
      accessCode,
      params.get("signature"),
    );
    if (!key)
      throw new RequestError("此仿真图片链接无效或不属于当前用户。", 403);
    headers.set("Authorization", "Bearer " + key);
    const upstream = await fetch(
      upstreamUrl(
        "containers/" + containerId + "/files/" + fileId + "/content",
      ),
      {
        headers,
        redirect: "error",
        cache: "no-store",
        signal: combinedSignal(req.signal, AbortSignal.timeout(15_000)),
      },
    );
    const type = upstream.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!upstream.ok || !upstream.body) {
      void upstream.body?.cancel().catch(() => {});
      if (upstream.status === 404 || upstream.status === 410)
        throw new RequestError("云端仿真图片已过期。请重新生成。", 404);
      throw new RequestError("暂时无法读取仿真图片，请稍后重试。", 502);
    }
    if (
      type &&
      type !== "application/octet-stream" &&
      !supportedTypes.has(type)
    ) {
      void upstream.body.cancel().catch(() => {});
      throw new RequestError("仿真文件不是支持的图片格式。", 415);
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type":
          type && supportedTypes.has(type)
            ? type
            : SIMULATION_IMAGE_TYPES[format],
        "Cache-Control": "private, no-store",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
