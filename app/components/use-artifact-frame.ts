import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import type { Artifact } from "../utils/campus-types";
import { artifactDocument } from "../utils/artifact-document";
import { saveFile } from "../utils/doc-io";
import { svgPng } from "../utils/client-runtime";
import { staticSvg } from "../utils/svg-export";

type ImageFormat = "png" | "svg";

async function captureBlob(
  format: unknown,
  data: unknown,
  request: ImageFormat,
) {
  const serialized = JSON.stringify(data);
  if (!serialized || serialized.length > 25 * 1024 * 1024)
    throw new Error("导出内容过大或无效。");
  if (request === "svg" && format === "svg" && typeof data === "string") {
    return new Blob([staticSvg(data)], { type: "image/svg+xml" });
  }
  if (request === "png") {
    if (format === "svg-png" && typeof data === "string")
      return svgPng(staticSvg(data));
    if (format === "snapshot") {
      const { rasterizeSnapshot } = await import("../utils/artifact-raster");
      return rasterizeSnapshot(data as Parameters<typeof rasterizeSnapshot>[0]);
    }
    if (
      format === "png" &&
      typeof data === "string" &&
      data.startsWith("data:image/png;base64,")
    )
      return (await fetch(data)).blob();
  }
  throw new Error("预览返回的导出格式无效。");
}

export function useArtifactFrame(
  artifact: Artifact | null,
  version = 0,
  inline = false,
) {
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef("");
  const pending = useRef<{
    id: string;
    format: ImageFormat;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [prepared, setPrepared] = useState<{
    artifact: Artifact;
    version: number;
    source: string;
  }>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const source =
    prepared?.artifact === artifact && prepared.version === version
      ? prepared.source
      : "";

  useEffect(() => {
    if (!artifact) return;
    const activeToken = nanoid();
    token.current = activeToken;
    setReady(false);
    setBusy(false);
    setError("");
    artifactDocument(artifact, activeToken, false, inline)
      .then((source) => {
        if (token.current === activeToken)
          setPrepared({ artifact, version, source });
      })
      .catch(() => {
        if (token.current === activeToken) setError("图形预览无法加载。");
      });
    return () => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      token.current = "";
    };
  }, [artifact, inline, version]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== "null" ||
        !token.current ||
        data?.token !== token.current
      )
        return;
      if (data.type === "artifact-error") {
        setError("图形代码或图表库加载失败。");
        return;
      }
      const request = pending.current;
      if (!request || data.type !== "capture-result" || data.id !== request.id)
        return;
      clearTimeout(request.timer);
      pending.current = null;
      const activeToken = token.current;
      try {
        if (typeof data.error === "string")
          throw new Error(data.error.slice(0, 300));
        const blob = await captureBlob(data.format, data.data, request.format);
        if (token.current === activeToken)
          await saveFile(
            blob,
            request.format === "svg" ? "preview.svg" : "preview@2x.png",
          );
      } catch (error) {
        if (token.current === activeToken) setError((error as Error).message);
      } finally {
        if (token.current === activeToken) setBusy(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function capture(format: ImageFormat) {
    const target = frame.current?.contentWindow;
    if (!source || !ready || !target || pending.current || busy) return;
    const id = nanoid();
    setError("");
    setBusy(true);
    pending.current = {
      id,
      format,
      timer: setTimeout(() => {
        pending.current = null;
        setBusy(false);
        setError("导出超时，请重新打开预览后重试。");
      }, 20_000),
    };
    target.postMessage(
      { type: "capture", token: token.current, id, format },
      "*",
    );
  }

  return {
    frame,
    source,
    ready,
    onLoad: () => setReady(true),
    busy,
    error,
    setError,
    capture,
  };
}
