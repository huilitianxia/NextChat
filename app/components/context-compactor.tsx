"use client";
import { useState } from "react";
import type { ChatSession } from "../store/chat";
import {
  compactionSlice,
  compactText,
  forkAt,
} from "../utils/conversation-tools";
import { CampusDialog } from "./campus-dialog";
import styles from "./finale.module.scss";
export default function ContextCompactor({
  session,
}: {
  session: ChatSession;
}) {
  const [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (session.messages.length <= 8) return null;
  return (
    <>
      <div className={styles.toolbar}>
        <button
          disabled={session.messages.some((m) => m.streaming)}
          onClick={() => {
            try {
              setDraft(compactText(compactionSlice(session).earlier));
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          浓缩前文
        </button>
        <small className={styles.muted}>保留原会话，生成可编辑摘要分支</small>
      </div>
      {draft !== null && (
        <CampusDialog title="浓缩前文" onClose={() => setDraft(null)}>
          <div className={styles.tools}>
            <p>
              本地提取历史要点，保留最近两轮左右的完整消息。请检查并补充关键约束；原会话完整保留。
            </p>
            <label>
              上下文摘要
              <textarea
                aria-label="上下文摘要"
                rows={12}
                value={draft}
                maxLength={12000}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <div className={styles.toolbar}>
              <button
                disabled={busy || !draft.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await forkAt(session, session.messages.at(-1)!.id, draft);
                    setDraft(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                使用摘要继续对话
              </button>
            </div>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </div>
        </CampusDialog>
      )}
      {error && draft === null && <p className={styles.error}>{error}</p>}
    </>
  );
}
