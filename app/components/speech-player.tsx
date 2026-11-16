"use client";
import { useEffect, useMemo, useState } from "react";
import { useCapstone } from "../store/capstone";
import { useChatStore } from "../store/chat";
import { cleanAcademicText, sentenceRanges } from "../utils/similarity-meter";
import styles from "./capstone.module.scss";
type SpeechRequest = NonNullable<
  ReturnType<typeof useCapstone.getState>["speech"]
>;
function readRendered(messageId: string, fallback: string) {
  const root = document.querySelector(
      `[data-assistant-message="${CSS.escape(messageId)}"] .markdown-body`,
    ),
    nodes: { node: Text; start: number; end: number }[] = [];
  let text = "",
    block: Element | null = null;
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        return !node.textContent ||
          parent?.closest(
            'pre,button,textarea,script,style,[data-export-hide],.katex,.mermaid,svg,[aria-hidden="true"]',
          )
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const next =
        node.parentElement?.closest("p,li,h1,h2,h3,h4,td,blockquote") || root;
      if (block && block !== next) text += "\n";
      block = next;
      const start = text.length;
      text += node.textContent;
      nodes.push({ node: node as Text, start, end: text.length });
    }
  }
  if (!text.trim()) text = cleanAcademicText(fallback);
  return { sentences: sentenceRanges(text), nodes };
}
function Player({ request }: { request: SpeechRequest }) {
  const [index, setIndex] = useState(0),
    [rate, setRate] = useState(1),
    [paused, setPaused] = useState(false),
    [error, setError] = useState("");
  const reading = useMemo(
      () => readRendered(request.messageId, request.content),
      [request],
    ),
    sentence = reading.sentences[index],
    stop = () => useCapstone.setState({ speech: null });
  useEffect(() => {
    if (
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      setError("当前浏览器不支持朗读。");
      return;
    }
    if (!sentence) {
      setError("这条回复没有可朗读的文本。");
      return;
    }
    let active = true;
    const synthesis = window.speechSynthesis;
    synthesis.cancel();
    setPaused(false);
    const utterance = new SpeechSynthesisUtterance(sentence.text);
    utterance.rate = rate;
    utterance.lang = /[\u4e00-\u9fff]/.test(sentence.text) ? "zh-CN" : "en-US";
    const voices = synthesis.getVoices(),
      voice =
        voices.find(
          (v) =>
            v.localService &&
            v.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2)),
        ) ||
        voices.find((v) =>
          v.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2)),
        );
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (!active) return;
      if (index + 1 < reading.sentences.length) setIndex((i) => i + 1);
      else stop();
    };
    utterance.onerror = (e) => {
      if (active && e.error !== "interrupted" && e.error !== "canceled")
        setError(`朗读引擎未能播放：${e.error}`);
    };
    const first = reading.nodes.find((n) => n.end > sentence.start),
      last = reading.nodes.find((n) => n.end >= sentence.end),
      highlights = (window.CSS as any)?.highlights;
    let fallbackElement: HTMLElement | null = null,
      oldColor = "";
    if (first && last) {
      const range = document.createRange();
      range.setStart(first.node, Math.max(0, sentence.start - first.start));
      range.setEnd(
        last.node,
        Math.min(last.node.length, sentence.end - last.start),
      );
      const HighlightCtor = (window as any).Highlight;
      if (highlights && HighlightCtor)
        highlights.set("campus-speech", new HighlightCtor(range));
      else {
        fallbackElement = first.node.parentElement;
        oldColor = fallbackElement?.style.backgroundColor || "";
        if (fallbackElement) fallbackElement.style.backgroundColor = "#ffe58f";
      }
    }
    synthesis.speak(utterance);
    return () => {
      active = false;
      synthesis.cancel();
      highlights?.delete("campus-speech");
      if (fallbackElement) fallbackElement.style.backgroundColor = oldColor;
    };
  }, [index, rate, reading, sentence]);
  return (
    <aside
      className={`${styles.player} ${styles.panel}`}
      aria-label="逐句高亮听书播放器"
    >
      <div className={styles.row}>
        <strong>
          朗读 {index + 1}/{reading.sentences.length}
        </strong>
        <button
          disabled={!!error}
          onClick={() => {
            if (paused) window.speechSynthesis.resume();
            else window.speechSynthesis.pause();
            setPaused(!paused);
          }}
        >
          {paused ? "继续朗读" : "暂停朗读"}
        </button>
        <button onClick={stop}>停止朗读</button>
        <label className={styles.inline}>
          语速
          <select
            value={rate}
            onChange={(e) => {
              setError("");
              setRate(Number(e.target.value));
            }}
          >
            {[0.8, 1, 1.25, 1.5, 2].map((n) => (
              <option key={n} value={n}>
                {n.toFixed(n === 1.25 ? 2 : 1)}x
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={styles.sentence} aria-live="polite">
        {sentence?.text}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </aside>
  );
}
export default function SpeechPlayer() {
  const request = useCapstone((s) => s.speech),
    sessionId = useChatStore((s) => s.sessions[s.currentSessionIndex]?.id);
  useEffect(() => {
    if (request && request.sessionId !== sessionId)
      useCapstone.setState({ speech: null });
  }, [request, sessionId]);
  return request && request.sessionId === sessionId ? (
    <Player
      key={`${request.messageId}-${request.owner}-${request.startedAt}`}
      request={request}
    />
  ) : null;
}
