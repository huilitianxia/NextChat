"use client";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChatSession, fillTemplateWith, useChatStore } from "../store/chat";
import { workflowInstruction } from "../config/workflow-templates";
import {
  contextWindow,
  estimateContext,
  tokenGauge,
  tokenLabel,
} from "../utils/context-meter";
import { currentIdentity } from "../utils/identity-storage";
import { useContextOperations } from "../store/context-operations";
import styles from "./junior.module.scss";
export function ContextMeter({
  session,
  content,
  images,
  revision,
}: {
  session: ChatSession;
  content: string;
  images: string[];
  revision?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [hovered, setHovered] = useState(false),
    [parts, setParts] = useState<ReturnType<typeof estimateContext> | null>(
      null,
    ),
    [error, setError] = useState("");
  const operation = useContextOperations();
  const anchor = useRef<HTMLDivElement>(null),
    hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const [placement, setPlacement] = useState<CSSProperties>({});
  const visible = open || hovered;
  const enter = () => {
    clearTimeout(hoverTimer.current);
    setHovered(true);
  };
  const leave = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(false), 150);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    if (!visible) return;
    const position = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(300, window.innerWidth - 24),
        above = rect.top > 220;
      setPlacement({
        position: "fixed",
        width,
        maxWidth: "calc(100vw - 24px)",
        left: Math.max(
          12,
          Math.min(window.innerWidth - width - 12, rect.right - width),
        ),
        right: "auto",
        bottom: above
          ? Math.max(12, window.innerHeight - rect.top + 8)
          : "auto",
        top: above ? "auto" : rect.bottom + 8,
        maxHeight: Math.max(
          120,
          above ? rect.top - 24 : window.innerHeight - rect.bottom - 24,
        ),
        overflowY: "auto",
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [visible]);
  useEffect(() => {
    let active = true;
    const owner = currentIdentity();
    const timer = setTimeout(async () => {
      try {
        const { retrieveReferences, referenceContext } = await import(
          "../utils/local-rag"
        );
        const [history, sources] = await Promise.all([
          useChatStore.getState().getMessagesWithMemory(session),
          owner === "locked"
            ? Promise.resolve([])
            : retrieveReferences(session.id, content),
        ]);
        const text = fillTemplateWith(content, session.mask.modelConfig);
        const draft = {
          role: "user" as const,
          content: images.length
            ? [
                { type: "text" as const, text },
                ...images.map((url) => ({
                  type: "image_url" as const,
                  image_url: { url },
                })),
              ]
            : text,
        };
        if (active && owner === currentIdentity()) {
          setParts(
            estimateContext(
              history,
              draft,
              workflowInstruction(session.workflowId),
              referenceContext(sources),
            ),
          );
          setError("");
        }
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setParts(null);
        }
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    session,
    session.id,
    session.messages,
    session.contextSummary,
    session.clearContextIndex,
    session.workflowId,
    session.mask,
    session.mask.modelConfig,
    session.memoryPrompt,
    content,
    images,
    revision,
  ]);
  const limit = contextWindow(session.contextWindow),
    gauge = tokenGauge(parts?.total || 0, limit),
    color = { green: "#399979", amber: "#c78e29", coral: "#df735e" }[
      gauge.tone
    ];
  const update = (f: (s: ChatSession) => void) =>
    useChatStore.getState().updateTargetSession(session, f);
  return (
    <div
      className={styles.gauge}
      ref={anchor}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <div className={styles.gaugeHead}>
        <button
          aria-label="上下文用量明细"
          aria-expanded={open || hovered}
          onClick={() => setOpen(!open)}
          title="本地估算：系统、历史、文件与 RAG"
        >
          上下文 {parts ? tokenLabel(parts.total) : "…"}
        </button>
        <span>/</span>
        <button
          aria-label="切换上下文窗口"
          onClick={() =>
            update((s) => {
              s.contextWindow = limit === 1000000 ? 256000 : 1000000;
            })
          }
        >
          {limit === 1000000 ? "1M" : "256k"}
        </button>
        <span>· {gauge.percent.toFixed(1)}%</span>
      </div>
      <div className={styles.track}>
        <span style={{ width: `${gauge.width}%`, background: color }} />
      </div>
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={styles.popover}
            style={placement}
            role="dialog"
            aria-label="上下文明细"
            onMouseEnter={enter}
            onMouseLeave={leave}
          >
            <strong>下一次请求 · 本地估算</strong>
            {error ? (
              <p role="alert">{error}</p>
            ) : (
              <dl>
                <dt>System 系统 / 专攻 / 摘要</dt>
                <dd>{tokenLabel(parts?.system || 0)}</dd>
                <dt>History 历史 + 当前输入</dt>
                <dd>{tokenLabel(parts?.history || 0)}</dd>
                <dt>Files & RAG 文件 / 图片</dt>
                <dd>{tokenLabel(parts?.filesRag || 0)}</dd>
              </dl>
            )}
            <span>
              1M 为输入规划预算；原生总窗口约 1.05M，预留输出空间。图片按每张
              1536 token 粗估，实际以服务端为准。
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <input
                style={{ width: 16, height: 16, flex: "0 0 16px", padding: 0 }}
                type="checkbox"
                checked={session.autoCompact === true}
                onChange={(e) =>
                  update((s) => {
                    s.autoCompact = e.target.checked;
                  })
                }
              />
              自动压缩 (75%)
            </label>
            <span>
              仅发送时触发，调用现有模型进行 AI
              摘要，保留最近三轮与全部原始记录。
            </span>
            {session.contextSummary && (
              <button
                onClick={() =>
                  update((s) => {
                    delete s.contextSummary;
                  })
                }
              >
                撤销浓缩 · 恢复完整上下文
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                setHovered(false);
              }}
            >
              关闭明细
            </button>
          </div>,
          document.body,
        )}
      {operation.sessionId === session.id && (
        <span role="status">
          {operation.progress}
          <button onClick={() => operation.cancel?.()}>取消</button>
        </span>
      )}
    </div>
  );
}
