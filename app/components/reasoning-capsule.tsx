"use client";
import { useEffect, useState } from "react";
import { EFFORT_LABELS, ReasoningEffort } from "../utils/reasoning";
import styles from "./polish.module.scss";
export default function ReasoningCapsule({
  text,
  thinking,
  startedAt,
  durationMs,
  effort = "medium",
  fallback,
  model,
}: {
  text: string;
  thinking: boolean;
  startedAt?: number;
  durationMs?: number;
  effort?: ReasoningEffort;
  fallback?: boolean;
  model?: string;
}) {
  const [now, setNow] = useState(Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [thinking]);
  const seconds = Math.max(
    0,
    Math.round((durationMs ?? (startedAt ? now - startedAt : 0)) / 1000),
  );
  return (
    <section className={styles.reasoning} aria-label="思考摘要">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span
          className={thinking ? styles.thinkingDot : styles.doneDot}
          aria-hidden="true"
        />
        <strong>{thinking ? "正在思考" : "思考摘要"}</strong>
        <span className={styles.effortBadge}>
          {model?.replace(/^gpt-(\d+(?:\.\d+)?)-sol$/i, "$1 Sol") || "AI"} ·{" "}
          {EFFORT_LABELS[effort]}
        </span>
        <small>
          {startedAt || durationMs !== undefined ? `${seconds} 秒` : ""}
        </small>
        <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>
      {fallback && (
        <p className={styles.fallback}>
          当前接口不支持极限档，本次已使用深度。
        </p>
      )}
      {open && (
        <div className={styles.reasoningText}>
          {text || "等待接口返回思考摘要…"}
        </div>
      )}
    </section>
  );
}
