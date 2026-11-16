"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { useChatStore } from "../store/chat";
import { forkAt } from "../utils/conversation-tools";
import { shareUrl } from "../utils/share-codec";
import { renderedPng } from "../utils/message-image";
import { saveFile } from "../utils/doc-io";
import { copyToClipboard } from "../utils";
import { currentIdentity } from "../utils/identity-storage";
import styles from "./finale.module.scss";
import { clipToVault, useCapstone } from "../store/capstone";
const RevisionDiff = dynamic(() => import("./revision-diff"), { ssr: false });
export default function MessageActions({
  messageId,
  content,
  original,
  assistant,
}: {
  messageId: string;
  content: string;
  original?: string;
  assistant: boolean;
}) {
  const [busy, setBusy] = useState(""),
    [status, setStatus] = useState(""),
    [manualLink, setManualLink] = useState(""),
    [error, setError] = useState("");
  async function run(kind: string) {
    setBusy(kind);
    setError("");
    setStatus("");
    const owner = currentIdentity(),
      session = useChatStore.getState().currentSession();
    try {
      if (kind === "branch") {
        await forkAt(session, messageId);
        return;
      }
      if (kind === "share") {
        const link = shareUrl(location.href, content, session.topic);
        if (!(await copyToClipboard(link))) {
          setManualLink(link);
          throw new Error("自动复制不可用，请手动复制下方链接。");
        }
        setManualLink("");
        setStatus("分享链接已复制。持有链接者可阅读这条回复。");
      }
      if (kind === "image") {
        const node = document.querySelector<HTMLElement>(
          `[data-assistant-message="${CSS.escape(messageId)}"]`,
        );
        if (!node) throw new Error("未找到回复内容。");
        const image = await renderedPng(node);
        if (owner === currentIdentity())
          await saveFile(image, `${session.topic}-长图.png`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div data-export-hide>
      {assistant && original && (
        <RevisionDiff prompt={original} answer={content} />
      )}
      <div className={styles.messageActions}>
        <button disabled={!!busy} onClick={() => void run("branch")}>
          从此处分叉
        </button>
        {assistant && (
          <>
            <button
              onClick={() =>
                void clipToVault({
                  content,
                  sessionId: useChatStore.getState().currentSession().id,
                  messageId,
                })
              }
            >
              收藏到知识手账
            </button>
            <button
              onClick={() =>
                useCapstone.setState({
                  speech: {
                    content,
                    messageId,
                    sessionId: useChatStore.getState().currentSession().id,
                    owner: currentIdentity(),
                    startedAt: Date.now(),
                  },
                })
              }
            >
              朗读
            </button>
            <button disabled={!!busy} onClick={() => void run("share")}>
              复制分享链接
            </button>
            <button disabled={!!busy} onClick={() => void run("image")}>
              存为长图
            </button>
          </>
        )}
        {busy && <span role="status">处理中…</span>}
      </div>
      {status && (
        <p role="status" className={styles.muted}>
          {status}
        </p>
      )}
      {manualLink && (
        <textarea
          aria-label="分享链接"
          readOnly
          value={manualLink}
          rows={3}
          style={{ width: "100%" }}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
