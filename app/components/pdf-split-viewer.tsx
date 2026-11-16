"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFinale } from "../store/finale";
import { currentIdentity } from "../utils/identity-storage";
import { attachReferencePdf, listReferenceDocuments } from "../utils/local-rag";
import { matchedPdfItems } from "../utils/pdf-highlight";
import styles from "./finale.module.scss";
export default function PdfSplitViewer() {
  const selected = useFinale((s) => s.pdf),
    canvas = useRef<HTMLCanvasElement>(null),
    area = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ArrayBuffer | null>(null),
    [page, setPage] = useState(1),
    [count, setCount] = useState(1),
    [width, setWidth] = useState(500),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [mobile, setMobile] = useState(false),
    [marks, setMarks] = useState<
      { x: number; y: number; w: number; h: number }[]
    >([]),
    [size, setSize] = useState({ width: 400, height: 560 });
  useEffect(() => {
    const media = matchMedia("(max-width:900px)"),
      change = () => setMobile(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!selected) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") useFinale.setState({ pdf: null });
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [selected]);
  useEffect(() => {
    let active = true;
    setData(null);
    setMarks([]);
    setError("");
    setPage(selected?.source.page || 1);
    if (!selected) return;
    void listReferenceDocuments(selected.sessionId)
      .then((docs) => {
        if (active && selected.owner === currentIdentity())
          setData(
            docs.find((d) => d.id === selected.source.documentId)?.pdfData ||
              null,
          );
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [selected, version]);
  useEffect(() => {
    if (!selected || !data || selected.owner !== currentIdentity()) return;
    let active = true,
      task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined,
      render: import("pdfjs-dist").RenderTask | undefined;
    setBusy(true);
    setError("");
    setMarks([]);
    void (async () => {
      const pdfjs = await import("pdfjs-dist"),
        base = `/pdfjs/${pdfjs.version}/`;
      pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
      if (!active) return;
      task = pdfjs.getDocument({
        data: new Uint8Array(data.slice(0)),
        isEvalSupported: false,
        cMapUrl: base + "cmaps/",
        cMapPacked: true,
        standardFontDataUrl: base + "standard_fonts/",
      });
      const pdf = await task.promise;
      if (!active) return;
      setCount(pdf.numPages);
      const target = await pdf.getPage(
        Math.min(Math.max(1, page), pdf.numPages),
      );
      if (!active) return;
      const raw = target.getViewport({ scale: 1 }),
        available = (area.current?.clientWidth || width) - 28,
        scale = Math.min(2, available / raw.width),
        viewport = target.getViewport({ scale }),
        node = canvas.current;
      if (!node) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      node.width = Math.floor(viewport.width * ratio);
      node.height = Math.floor(viewport.height * ratio);
      setSize({ width: viewport.width, height: viewport.height });
      render = target.render({
        canvasContext: node.getContext("2d")!,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await render.promise;
      const content = await target.getTextContent();
      if (!active) return;
      const texts = content.items.map((item) =>
        "str" in item ? item.str : "",
      );
      const indices =
        page === selected.source.page
          ? matchedPdfItems(texts, selected.source.text)
          : [];
      setMarks(
        indices.flatMap((index) => {
          const item = content.items[index];
          if (!("str" in item)) return [];
          const t = pdfjs.Util.transform(viewport.transform, item.transform),
            h = Math.hypot(t[2], t[3]);
          return [
            {
              x: t[4],
              y: t[5] - h,
              w: Math.max(2, item.width * scale),
              h: h * 1.2,
            },
          ];
        }),
      );
    })()
      .catch((e) => {
        if (active && e.name !== "RenderingCancelledException")
          setError(e.message || "PDF 打开失败。");
      })
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
      render?.cancel();
      if (task) void task.destroy();
    };
  }, [selected, data, page, width, mobile]);
  if (!selected || selected.owner !== currentIdentity()) return null;
  const close = () => useFinale.setState({ pdf: null });
  const panel = (
    <aside
      className={styles.pdfPane}
      style={{ width: mobile ? "100%" : width }}
      aria-label="文献分屏精读器"
      role={mobile ? "dialog" : "complementary"}
      aria-modal={mobile || undefined}
    >
      {!mobile && (
        <div
          className={styles.resize}
          role="separator"
          aria-label="调整 PDF 宽度"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={800}
          aria-valuenow={width}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setWidth((w) => Math.min(800, w + 20));
            if (e.key === "ArrowRight") setWidth((w) => Math.max(320, w - 20));
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              setWidth((w) => Math.min(800, Math.max(320, w - e.movementX)));
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        />
      )}
      <header>
        <div>
          <small>文献分屏精读器</small>
          <strong>{selected.source.name}</strong>
        </div>
        <button onClick={close} aria-label="关闭文献分屏">
          ×
        </button>
      </header>
      <div className={styles.toolbar}>
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          上一页
        </button>
        <label>
          页{" "}
          <input
            aria-label="PDF 页码"
            type="number"
            min="1"
            max={count}
            value={page}
            onChange={(e) =>
              setPage(Math.min(count, Math.max(1, Number(e.target.value) || 1)))
            }
          />
        </label>
        <span>/ {count}</span>
        <button disabled={page >= count} onClick={() => setPage((p) => p + 1)}>
          下一页
        </button>
        <button onClick={() => setPage(selected.source.page || 1)}>
          定位引用
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.pdfScroll} ref={area}>
        {!data ? (
          <div className={styles.card}>
            <p>此旧资料尚未保存原 PDF。补传后即可跳页与高亮，原引用不变。</p>
            <label className={styles.fileLabel}>
              补传原 PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    await attachReferencePdf(
                      selected.sessionId,
                      selected.source.documentId,
                      file,
                    );
                    setVersion((v) => v + 1);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
        ) : (
          <div className={styles.pdfPage} style={size}>
            <canvas ref={canvas} style={size} />
            {marks.map((m, i) => (
              <mark
                key={i}
                style={{ left: m.x, top: m.y, width: m.w, height: m.h }}
                aria-label="引用匹配文本"
              />
            ))}
          </div>
        )}
        {busy && <p role="status">正在本地读取 PDF…</p>}
        <details className={styles.card} open>
          <summary>
            引用原文 · 第 {selected.source.page} 页
            {marks.length ? " · 已高亮" : ""}
          </summary>
          <p className={styles.prewrap}>{selected.source.text}</p>
          {data && !busy && !marks.length && page === selected.source.page && (
            <small>未能精确匹配版面文字，可对照此原文片段阅读。</small>
          )}
        </details>
      </div>
    </aside>
  );
  return mobile ? createPortal(panel, document.body) : panel;
}
