"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCampusUI } from "../store/campus";
import { useAccessStore } from "../store/access";
import { currentIdentity } from "../utils/identity-storage";
import { artifactDocument } from "../utils/artifact-document";
import { saveFile } from "../utils/doc-io";
import { svgPng } from "../utils/client-runtime";
import styles from "./campus.module.scss";
export default function ArtifactPreview() {
  const { artifact, closeArtifact } = useCampusUI();
  const identity = useAccessStore((state) => state.friendProfile?.identityId);
  const [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [width, setWidth] = useState(520),
    [mobile, setMobile] = useState(false),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null),
    token = useRef(""),
    pending = useRef<{
      id: string;
      timer: ReturnType<typeof setTimeout>;
    } | null>(null),
    resize = useRef<(() => void) | null>(null);
  useEffect(() => {
    const media = matchMedia("(max-width:900px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!artifact || artifact.owner !== currentIdentity()) return;
    let active = true;
    token.current = crypto.randomUUID();
    setSource("");
    setError("");
    artifactDocument(artifact, token.current)
      .then((doc) => {
        if (active) setSource(doc);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      setBusy(false);
      resize.current?.();
    };
  }, [artifact, identity, version]);
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (
        event.source !== frame.current?.contentWindow ||
        !pending.current ||
        data?.type !== "capture-result" ||
        data.token !== token.current ||
        data.id !== pending.current.id
      )
        return;
      clearTimeout(pending.current.timer);
      pending.current = null;
      setBusy(false);
      if (data.error) {
        setError(String(data.error).slice(0, 500));
        return;
      }
      try {
        const serialized = JSON.stringify(data.data);
        if (!serialized || serialized.length > 25 * 1024 * 1024)
          throw new Error("导出内容过大或无效");
        if (data.format === "snapshot") {
          setBusy(true);
          const { rasterizeSnapshot } = await import(
            "../utils/artifact-raster"
          );
          await saveFile(await rasterizeSnapshot(data.data), "preview@2x.png");
        } else if (
          data.format === "svg-png" &&
          typeof data.data === "string" &&
          data.data.startsWith("<svg")
        )
          await saveFile(await svgPng(data.data), "preview@2x.png");
        else if (
          data.format === "svg" &&
          typeof data.data === "string" &&
          data.data.startsWith("<svg")
        )
          await saveFile(
            new Blob([data.data], { type: "image/svg+xml" }),
            "preview.svg",
          );
        else if (
          data.format === "png" &&
          typeof data.data === "string" &&
          data.data.startsWith("data:image/png;base64,")
        )
          await saveFile(
            await (await fetch(data.data)).blob(),
            "preview@2x.png",
          );
        else setError("预览返回的导出格式无效");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    if (!mobile || !artifact) return;
    const opener = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeArtifact();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (opener?.isConnected) opener.focus();
    };
  }, [mobile, artifact, closeArtifact]);
  if (!artifact || artifact.owner !== currentIdentity()) return null;
  const capture = (format: "png" | "svg") => {
    setError("");
    setBusy(true);
    const id = crypto.randomUUID();
    pending.current = {
      id,
      timer: setTimeout(() => {
        pending.current = null;
        setBusy(false);
        setError("导出超时，请刷新预览后重试。");
      }, 20000),
    };
    frame.current?.contentWindow?.postMessage(
      { type: "capture", token: token.current, id, format },
      "*",
    );
  };
  const panel = (
    <aside
      className={styles.preview}
      style={{ width }}
      aria-label="作品预览"
      role={mobile ? "dialog" : "complementary"}
      aria-modal={mobile || undefined}
    >
      {!mobile && (
        <div
          className={styles.resize}
          role="separator"
          aria-label="调整预览宽度"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={850}
          aria-valuenow={width}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setWidth((w) => Math.min(850, w + 20));
            if (e.key === "ArrowRight") setWidth((w) => Math.max(320, w - 20));
          }}
          onPointerDown={(e) => {
            const start = e.clientX,
              original = width;
            const move = (event: PointerEvent) =>
              setWidth(
                Math.max(320, Math.min(850, original + start - event.clientX)),
              );
            const stop = () => {
              document.removeEventListener("pointermove", move);
              document.removeEventListener("pointerup", stop);
            };
            resize.current = stop;
            document.addEventListener("pointermove", move);
            document.addEventListener("pointerup", stop, { once: true });
          }}
        />
      )}
      <header>
        <div className={styles.toolbar}>
          <strong>{artifact.kind.toUpperCase()} 预览</strong>
          <button onClick={() => setVersion((v) => v + 1)} disabled={busy}>
            刷新
          </button>
          <button onClick={() => capture("png")} disabled={!source || busy}>
            高清 PNG
          </button>
          <button
            onClick={() => capture("svg")}
            disabled={!source || busy || artifact.kind === "html"}
          >
            SVG
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              try {
                await saveFile(
                  new Blob([await artifactDocument(artifact, "", true)], {
                    type: "text/html;charset=utf-8",
                  }),
                  "artifact.html",
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            独立 HTML
          </button>
          <button onClick={closeArtifact} aria-label="关闭预览">
            ×
          </button>
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {busy && <p role="status">正在导出…</p>}
      </header>
      {source ? (
        <iframe
        key={token.current}
          ref={frame}
          title="作品预览沙箱"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={source}
        />
      ) : (
        <p className={styles.muted}>正在准备本地预览…</p>
      )}
    </aside>
  );
  return mobile ? createPortal(panel, document.body) : panel;
}
