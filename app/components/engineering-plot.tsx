"use client";

import {
  Component,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArtifactsShareButton } from "./artifacts";
import { CampusDialog } from "./campus-dialog";
import { useArtifactFrame } from "./use-artifact-frame";
import styles from "./engineering-plot.module.scss";

export class PlotErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <>
        <p role="alert">图形预览无法显示，原始代码仍可查看。</p>
        {this.props.fallback}
      </>
    ) : (
      this.props.children
    );
  }
}

const tabs = [
  { value: "preview", label: "预览" },
  { value: "code", label: "代码" },
] as const;

export default function EngineeringPlot({
  kind,
  code,
  codeView,
}: {
  kind: "svg" | "html";
  code: string;
  codeView: ReactNode;
}) {
  const title = kind === "svg" ? "SVG 图形预览" : "HTML 图表预览";
  const artifact = useMemo(() => ({ kind, code, title }), [kind, code, title]);
  const { frame, source, ready, onLoad, busy, error, capture } =
    useArtifactFrame(artifact, 0, true);
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("preview");
  const [fullscreen, setFullscreen] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const id = useId();

  useEffect(() => {
    const change = () =>
      setFullscreen(document.fullscreenElement === panel.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  async function expand() {
    setTab("preview");
    if (fullscreen) {
      await document.exitFullscreen();
      return;
    }
    if (panel.current?.requestFullscreen) {
      try {
        await panel.current.requestFullscreen();
        return;
      } catch {
        // Safari can reject element fullscreen on phones.
      }
    }
    setEnlarged(true);
  }

  const contents = (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="图形内容">
          {tabs.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              id={id + "-" + value + "-tab"}
              role="tab"
              aria-selected={tab === value}
              aria-controls={id + "-" + value}
              tabIndex={tab === value ? 0 : -1}
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "preview"
                    : event.key === "End"
                    ? "code"
                    : value === "preview"
                    ? "code"
                    : "preview";
                setTab(next);
                document.getElementById(id + "-" + next + "-tab")?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {!enlarged && (
          <button type="button" onClick={() => void expand()} disabled={busy}>
            {fullscreen ? "退出全屏" : "全屏放大"}
          </button>
        )}
        <button
          type="button"
          onClick={() => capture("svg")}
          disabled={!ready || busy || tab !== "preview"}
        >
          下载 SVG
        </button>
        <button
          type="button"
          onClick={() => capture("png")}
          disabled={!ready || busy || tab !== "preview"}
        >
          下载 PNG
        </button>
        {kind === "html" && <ArtifactsShareButton getCode={() => code} />}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className={styles.status} role="status">
          正在导出图形…
        </p>
      )}
      <div
        className={styles.preview}
        id={id + "-preview"}
        role="tabpanel"
        aria-labelledby={id + "-preview-tab"}
        hidden={tab !== "preview"}
      >
        {source ? (
          <iframe
            ref={frame}
            title={title}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={source}
            onLoad={onLoad}
          />
        ) : (
          <p className={styles.status} role="status">
            正在准备图形预览…
          </p>
        )}
      </div>
      <div
        className={styles.code}
        id={id + "-code"}
        role="tabpanel"
        aria-labelledby={id + "-code-tab"}
        hidden={tab !== "code"}
      >
        {codeView}
      </div>
    </>
  );

  if (enlarged) {
    return (
      <CampusDialog title="放大图形预览" onClose={() => setEnlarged(false)}>
        <section className={styles.expanded}>{contents}</section>
      </CampusDialog>
    );
  }
  return (
    <section className={styles.plot} ref={panel}>
      {contents}
    </section>
  );
}
