"use client";
import { useMemo, useState } from "react";
import { compareRevision, revisionPair } from "../utils/diff-helper";
import styles from "./finale.module.scss";
import { similarityMetrics } from "../utils/similarity-meter";
export default function RevisionDiff({
  prompt,
  answer,
}: {
  prompt: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false),
    [split, setSplit] = useState(false),
    [n, setN] = useState(3);
  const result = useMemo(() => {
    if (!open) return null;
    try {
      const pair = revisionPair(prompt, answer);
      return {
        parts: compareRevision(pair.before, pair.after, pair.code),
        metrics: similarityMetrics(pair.before, pair.after, n),
        error: "",
      };
    } catch (e) {
      return { parts: [], metrics: null, error: (e as Error).message };
    }
  }, [open, prompt, answer, n]);
  if (!prompt.trim() || !answer.trim()) return null;
  const part = (
    value: ReturnType<typeof compareRevision>[number],
    i: number,
  ) =>
    value.added ? (
      <ins key={i}>{value.value}</ins>
    ) : value.removed ? (
      <del key={i}>{value.value}</del>
    ) : (
      <span key={i}>{value.value}</span>
    );
  return (
    <section data-export-hide>
      <div className={styles.toolbar}>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          对照原文差异
        </button>
        {open && (
          <>
            <button aria-pressed={!split} onClick={() => setSplit(false)}>
              合并
            </button>
            <button aria-pressed={split} onClick={() => setSplit(true)}>
              左右对照
            </button>
            <small>红色删除 · 绿色新增</small>
          </>
        )}
      </div>
      {open && result?.metrics && (
        <div className={styles.output} aria-label="本地重合度自检">
          <label>
            N-gram 大小{" "}
            <select value={n} onChange={(e) => setN(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </label>
          <p>
            原文：{result.metrics.original.characters} 净字符 /{" "}
            {result.metrics.original.words} 词元 · 修订稿：
            {result.metrics.revised.characters} 净字符 /{" "}
            {result.metrics.revised.words} 词元
          </p>
          <strong>
            Jaccard 重合度：
            {result.metrics.similarity === null
              ? "无可比较文本"
              : result.metrics.similarity.toFixed(2) + "%"}
          </strong>
          <p>
            去除 Markdown、代码块和 LaTeX
            标记；字符数不含空白，中文逐字、英文按词计数。短于 N
            时按整段比较；词面重合不代表抄袭判定。
          </p>
        </div>
      )}
      {open &&
        result &&
        (result.error ? (
          <p role="alert" className={styles.error}>
            {result.error}
          </p>
        ) : (
          <div
            className={`${styles.diff} ${split ? styles.split : ""}`}
            aria-label="修订差异"
          >
            {split ? (
              <>
                <div>
                  <strong>原文</strong>
                  <br />
                  {result.parts.filter((p) => !p.added).map(part)}
                </div>
                <div>
                  <strong>修订稿</strong>
                  <br />
                  {result.parts.filter((p) => !p.removed).map(part)}
                </div>
              </>
            ) : (
              result.parts.map(part)
            )}
          </div>
        ))}
    </section>
  );
}
