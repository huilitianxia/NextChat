"use client";
import { useEffect, useRef, useState } from "react";
import { getHeaders } from "../client/api";
import {
  CAPABILITY_CHECKS,
  CapabilityEvent,
  CapabilityResult,
} from "../utils/health-check";
import styles from "./settings.module.scss";

export default function CapabilityCheck() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    Partial<Record<CapabilityResult["id"], CapabilityResult>>
  >({});
  const [message, setMessage] = useState("");
  const [started, setStarted] = useState(false);
  const abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);

  async function check() {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setStarted(true);
    setResults({});
    setMessage("正在测试，图片编辑可能需要一两分钟…");
    let completed = false;
    const received = new Set<string>();
    try {
      const response = await fetch("/api/health-check", {
        method: "POST",
        headers: getHeaders(),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `测试请求失败（${response.status}）`);
      }
      if (!response.body) throw new Error("服务没有返回测试结果。");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      function accept(line: string) {
        if (!line.trim()) return;
        const event = JSON.parse(line) as CapabilityEvent;
        if (
          event.type === "result" &&
          CAPABILITY_CHECKS.some((item) => item.id === event.result.id)
        ) {
          received.add(event.result.id);
          setResults((value) => ({
            ...value,
            [event.result.id]: event.result,
          }));
        } else if (event.type === "done") completed = true;
      }
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 65536) throw new Error("测试结果格式无效。");
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) accept(line);
        }
        accept(buffer + decoder.decode());
      } finally {
        reader.releaseLock();
      }
      if (!completed || received.size !== CAPABILITY_CHECKS.length)
        throw new Error("连接中断，部分项目尚未完成，请重试。");
      setMessage(`测试完成 · ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error ? error.message : "测试失败，请稍后重试。",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (abort.current === controller) abort.current = undefined;
    }
  }

  return (
    <section className={styles.card} aria-label="增强接口连通性">
      <h2>增强功能连接测试</h2>
      <p>会发起四项小规模真实请求，可能产生少量费用。结果只代表本次测试。</p>
      <div className={styles.healthActions}>
        <button
          type="button"
          className={styles.healthButton}
          disabled={busy}
          onClick={check}
        >
          {busy ? "正在测试四项增强接口…" : "测试四项增强接口连通性"}
        </button>
        {busy && (
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              abort.current?.abort();
              abort.current = undefined;
              setBusy(false);
              setMessage("测试已取消，已发起的请求仍可能计费。");
            }}
          >
            停止等待
          </button>
        )}
      </div>
      {started && (
        <ul
          className={styles.healthResults}
          aria-label="四项接口测试结果"
          aria-live="polite"
        >
          {CAPABILITY_CHECKS.map((item) => {
            const result = results[item.id];
            return (
              <li key={item.id} data-status={result?.status || "pending"}>
                <div>
                  <strong>{item.label}</strong>
                  <span>
                    {result
                      ? result.status === "ok"
                        ? "通过"
                        : result.status === "fallback"
                        ? "后备可用"
                        : "未通过"
                      : busy
                      ? "测试中…"
                      : "未完成"}
                  </span>
                </div>
                <code>{result?.model || item.model}</code>
                {result && (
                  <p>
                    {result.message}（{(result.durationMs / 1000).toFixed(1)}{" "}
                    秒）
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {message && (
        <p role="status" className={styles.status}>
          {message}
        </p>
      )}
    </section>
  );
}
