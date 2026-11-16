"use client";
import { useEffect, useRef, useState } from "react";
import { saveFile } from "../utils/doc-io";
import { loadClientScript } from "../utils/client-runtime";
import styles from "./campus.module.scss";
export default function MindmapViewer({ code }: { code: string }) {
  const svg = useRef<SVGSVGElement>(null),
    instance = useRef<{ destroy: () => void; fit: () => void }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    (async () => {
      try {
        const { Transformer } = await import("markmap-lib");
        await loadClientScript("/toolkit/d3.min.js");
        await loadClientScript("/toolkit/markmap-view.js");
        const { Markmap } = (window as any)
          .markmap as typeof import("markmap-view");
        const transformer = new Transformer();
        const { root } = transformer.transform(code.slice(0, 30000));
        const clean = (node: any) => {
          const parsed = new DOMParser().parseFromString(
            node.content || "",
            "text/html",
          );
          node.content = (parsed.body.textContent || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          node.children?.forEach(clean);
        };
        clean(root);
        if (active && svg.current)
          instance.current = Markmap.create(
            svg.current,
            { autoFit: true, duration: 0, maxWidth: 220 },
            root,
          );
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
      instance.current?.destroy();
    };
  }, [code]);
  return (
    <div className={styles.codeTool}>
      <svg
        ref={svg}
        style={{ width: "100%", height: 400 }}
        aria-label="可缩放思维导图"
      />
      <div className={styles.toolbar}>
        <button onClick={() => instance.current?.fit()}>适应窗口</button>
        <button
          onClick={async () => {
            if (svg.current)
              await saveFile(
                new Blob([new XMLSerializer().serializeToString(svg.current)], {
                  type: "image/svg+xml",
                }),
                "mindmap.svg",
              );
          }}
        >
          下载 SVG
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
