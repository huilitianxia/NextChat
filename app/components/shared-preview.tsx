"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import RemarkMath from "remark-math";
import RemarkGfm from "remark-gfm";
import RehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { SharedMessage, decodeShareAsync } from "../utils/share-codec";
import { useAccessStore } from "../store/access";
import { useChatStore, createMessage } from "../store/chat";
import { currentIdentity } from "../utils/identity-storage";
import { Path } from "../constant";
import styles from "./finale.module.scss";
const PENDING = "nextchat:pending-share-import";
export default function SharedPreview({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = useAccessStore(),
    [encoded, setEncoded] = useState<string | null>(() =>
      location.hash.startsWith("#share=") ? location.hash.slice(7) : null,
    ),
    [value, setValue] = useState<SharedMessage | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const receive = (event: Event) => {
      if (location.hash.startsWith("#share=")) {
        // Claim share fragments before HashRouter redirects an unknown route.
        event.stopImmediatePropagation();
        // Native fragment navigation may create a null history state in Next 14.
        if (history.state === null) history.replaceState({}, "");
        setEncoded(location.hash.slice(7));
      }
    };
    window.addEventListener("hashchange", receive, true);
    window.addEventListener("popstate", receive, true);
    window.addEventListener("campus:share", receive);
    return () => {
      window.removeEventListener("hashchange", receive, true);
      window.removeEventListener("popstate", receive, true);
      window.removeEventListener("campus:share", receive);
    };
  }, []);
  useEffect(() => {
    if (access.identityVerified && currentIdentity() !== "locked") {
      try {
        const pending = sessionStorage.getItem(PENDING);
        if (pending) setEncoded(pending);
      } catch {}
    }
  }, [access.identityVerified]);
  useEffect(() => {
    if (encoded === null) return;
    let active = true;
    setValue(null);
    setError("");
    void decodeShareAsync(encoded)
      .then((data) => {
        if (active) setValue(data);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [encoded]);
  function close() {
    setEncoded(null);
    setValue(null);
    try {
      sessionStorage.removeItem(PENDING);
    } catch {}
    routeTo(Path.Chat);
  }
  function routeTo(path: string) {
    if (history.state === null) history.replaceState({}, "");
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${location.search}#${path}`,
    );
  }
  function importMessage() {
    if (!value) return;
    if (!access.identityVerified || currentIdentity() === "locked") {
      try {
        sessionStorage.setItem(PENDING, encoded!);
      } catch {
        setError("浏览器不允许暂存分享内容，请先登录后重新打开链接。");
        return;
      }
      setEncoded(null);
      routeTo(Path.Auth);
      return;
    }
    const store = useChatStore.getState();
    store.newSession();
    store.updateTargetSession(store.currentSession(), (session) => {
      session.topic = value.title + " · 分享导入";
      session.messages = [
        createMessage({ role: "assistant", content: value.content }),
      ];
      session.lastUpdate = Date.now();
    });
    close();
  }
  if (encoded === null) return <>{children}</>;
  return (
    <main className={styles.sharePage}>
      <article role="dialog" aria-modal="true" aria-label="只读分享预览">
        <small>Campus Workspace · 只读分享</small>
        <h1>{value?.title || "学习笔记"}</h1>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : !value ? (
          <p role="status">正在本地解码…</p>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown
              skipHtml
              remarkPlugins={[RemarkMath, RemarkGfm]}
              rehypePlugins={[[RehypeKatex, { trust: false }]]}
              components={{
                img: ({ alt }) => (
                  <span>［图片：{alt || "未载入远程资源"}］</span>
                ),
                a: ({ href, children }) => (
                  <a
                    href={/^https?:\/\//i.test(href || "") ? href : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {value.content}
            </ReactMarkdown>
          </div>
        )}
        <div className={styles.toolbar}>
          <button disabled={!value} onClick={importMessage}>
            {access.identityVerified
              ? "导入到我的对话继续追问"
              : "登录后导入到我的对话"}
          </button>
          <button onClick={close}>关闭分享预览</button>
        </div>
        <p className={styles.muted}>
          内容保存在链接片段中，由你的浏览器解码。导入后才写入当前用户的本地会话。
        </p>
      </article>
    </main>
  );
}
