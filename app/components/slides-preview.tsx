"use client";
import { useMemo, useState } from "react";
import {
  detectSlides,
  paginateSlides,
  presentationBlob,
  SlideTheme,
} from "../utils/slides";
import { saveFile } from "../utils/doc-io";
import styles from "./polish.module.scss";
export default function SlidesPreview({ content }: { content: string }) {
  const deck = useMemo(() => detectSlides(content), [content]);
  const [theme, setTheme] = useState<SlideTheme>("academic"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!deck) return null;
  let pages;
  try {
    pages = paginateSlides(deck).slides;
  } catch {
    return <p role="alert">演示文稿内容过长，请拆分后导出。</p>;
  }
  return (
    <section
      className={styles.slides}
      data-slide-theme={theme}
      aria-label="幻灯片预览"
    >
      <div className={styles.slideHeader}>
        <strong>{pages.length} 张可编辑幻灯片</strong>
        <select
          aria-label="PPT 配色"
          value={theme}
          onChange={(e) => setTheme(e.target.value as SlideTheme)}
        >
          <option value="academic">学术简约白</option>
          <option value="tech">深色科技风</option>
        </select>
      </div>
      <div className={styles.slideStrip}>
        {pages.map((slide, i) => (
          <article key={i} aria-label={`第 ${i + 1} 页：${slide.title}`}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <h3>{slide.title}</h3>
            {slide.subtitle && <p>{slide.subtitle}</p>}
            <ul>
              {slide.bullets.slice(0, 3).map((bullet, j) => (
                <li key={j}>{bullet}</li>
              ))}
            </ul>
            {slide.notes && <small>含演讲备注</small>}
          </article>
        ))}
      </div>
      <button
        data-zen-hide
        className={styles.primaryAction}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await saveFile(
              await presentationBlob(deck, theme),
              `${deck.title}.pptx`,
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在生成 PPT…" : "导出 PPT (.pptx)"}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
