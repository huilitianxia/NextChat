import { useEffect, useState } from "react";
import styles from "./mobile-chat.module.scss";

export function MobileThinking({
  text,
  thinking,
  startedAt,
  durationMs,
  fallback,
}: {
  text: string;
  thinking: boolean;
  startedAt?: number;
  durationMs?: number;
  fallback?: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean>();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [thinking]);
  const seconds = Math.max(
    0,
    Math.floor((durationMs ?? (startedAt ? now - startedAt : 0)) / 1000),
  );
  const hasTiming =
    thinking || durationMs !== undefined || startedAt !== undefined;
  const visible = expanded ?? thinking;
  return (
    <section className={styles.thinkingCard} aria-label="思考摘要">
      <button
        type="button"
        aria-expanded={visible}
        onClick={() => setExpanded(!visible)}
      >
        <span
          className={thinking ? styles.thinkingPulse : styles.thinkingDone}
          aria-hidden="true"
        />
        <strong>
          {thinking ? "正在深度思考" : "已深度思考"}
          {hasTiming ? " " + seconds + " 秒" : ""}
        </strong>
        <span aria-hidden="true">{visible ? "⌃" : "⌄"}</span>
      </button>
      {fallback && (
        <small className={styles.thinkingFallback}>
          当前接口已将极限档切换为深度档
        </small>
      )}
      {visible && (
        <div
          className={expanded ? styles.thinkingDetail : styles.thinkingExcerpt}
        >
          {(expanded ? text : text.slice(-180)) || "等待思考摘要…"}
        </div>
      )}
    </section>
  );
}
