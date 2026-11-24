"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCampusUI } from "../store/campus";
import { currentIdentity } from "../utils/identity-storage";
import { artifactDocument } from "../utils/artifact-document";
import { saveFile } from "../utils/doc-io";
import { useArtifactFrame } from "./use-artifact-frame";
import styles from "./campus.module.scss";
export default function ArtifactPreview() {
  const { artifact: selected, closeArtifact } = useCampusUI();
  const artifact = selected?.owner === currentIdentity() ? selected : null;
  const [width, setWidth] = useState(520),
    [mobile, setMobile] = useState(false),
    [version, setVersion] = useState(0);
  const { frame, source, error, setError, ready, onLoad, busy, capture } =
    useArtifactFrame(artifact, version);
  const resize = useRef<(() => void) | null>(null);
  useEffect(() => {
    const media = matchMedia("(max-width:900px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => () => resize.current?.(), [artifact]);
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
  if (!artifact) return null;
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
          <button onClick={() => capture("png")} disabled={!ready || busy}>
            高清 PNG
          </button>
          <button
            onClick={() => capture("svg")}
            disabled={!ready || busy || artifact.kind === "html"}
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
          key={version}
          ref={frame}
          title="作品预览沙箱"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={source}
          onLoad={onLoad}
        />
      ) : (
        <p className={styles.muted}>正在准备本地预览…</p>
      )}
    </aside>
  );
  return mobile ? createPortal(panel, document.body) : panel;
}
