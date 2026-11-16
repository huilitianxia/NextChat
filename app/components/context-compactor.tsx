"use client";
import { useEffect, useState } from "react";
import { ChatSession, useChatStore } from "../store/chat";
import {
  compactionPlan,
  createContextSummary,
  activeSummary,
} from "../utils/context-compaction";
import { compactText } from "../utils/conversation-tools";
import { semanticCompaction } from "../utils/context-runtime";
import { useContextOperations } from "../store/context-operations";
import { CampusDialog } from "./campus-dialog";
import styles from "./finale.module.scss";
export default function ContextCompactor({
  session,
}: {
  session: ChatSession;
}) {
  const [draft, setDraft] = useState<string | null>(null),
    [plan, setPlan] = useState<ReturnType<typeof compactionPlan> | null>(null),
    [method, setMethod] = useState<"ai" | "local">("local"),
    [error, setError] = useState("");
  const operation = useContextOperations();
  const busy = operation.sessionId !== null;
  useEffect(
    () => () => {
      if (useContextOperations.getState().sessionId === session.id)
        useContextOperations.getState().cancel?.();
    },
    [session.id],
  );
  const run = async (ai: boolean) => {
    try {
      setError("");
      setMethod(ai ? "ai" : "local");
      if (ai) {
        const result = await semanticCompaction(session.id);
        setPlan(result.plan);
        setDraft(result.text);
      } else {
        const p = compactionPlan(session);
        setPlan(p);
        setDraft(
          [activeSummary(session)?.summary.text, compactText(p.earlier)]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 12000),
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (session.messages.filter((m) => m.role === "user").length <= 3)
    return null;
  return (
    <>
      <div className={styles.toolbar}>
        <button
          disabled={busy || session.messages.some((m) => m.streaming)}
          onClick={() => void run(false)}
        >
          浓缩前文
        </button>
        <button
          disabled={busy || session.messages.some((m) => m.streaming)}
          onClick={() => void run(true)}
        >
          AI 智能浓缩
        </button>
        <small className={styles.muted}>
          保留最近三轮 · 原始记录可随时恢复
        </small>
        {busy && <button onClick={() => operation.cancel?.()}>取消浓缩</button>}
      </div>
      {draft !== null && plan && (
        <CampusDialog
          title={method === "ai" ? "AI 智能浓缩" : "本地摘录浓缩"}
          onClose={() => setDraft(null)}
        >
          <div className={styles.tools}>
            <p>
              {method === "ai"
                ? "已通过现有聊天接口生成语义摘要，请核查公式、文件事实与未完成事项。"
                : "本地摘录可能省略细节，请补充关键约束。"}
              应用后只替换发送上下文，最近三轮原文与全部历史记录保留。
            </p>
            <label>
              上下文摘要
              <textarea
                aria-label="上下文摘要"
                rows={12}
                maxLength={12000}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button
              disabled={!draft.trim()}
              onClick={() => {
                try {
                  const store = useChatStore.getState(),
                    current = store.currentSession();
                  if (current.id !== session.id)
                    throw new Error("会话已切换。");
                  const summary = createContextSummary(
                    current,
                    plan,
                    draft,
                    method,
                  );
                  store.updateTargetSession(current, (s) => {
                    s.contextSummary = summary;
                  });
                  setDraft(null);
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              使用摘要继续对话
            </button>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </div>
        </CampusDialog>
      )}
      {error && draft === null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
