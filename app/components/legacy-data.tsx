"use client";
import { useEffect, useState } from "react";
import { indexedDBStorage } from "../utils/indexedDB-storage";
import { StoreKey } from "../constant";
import { useChatStore } from "../store";
import { currentIdentity } from "../utils/identity-storage";
import { showConfirm } from "./ui-lib";
import { saveFile } from "../utils/doc-io";
import styles from "./campus.module.scss";
export default function LegacyData() {
  const [raw, setRaw] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => {
    let active = true;
    indexedDBStorage.getItem(StoreKey.Chat).then((value) => {
      if (active && value) setRaw(value);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!raw) return null;
  async function restore() {
    const owner = currentIdentity();
    if (
      !(await showConfirm(
        "这些是升级前未分配身份的旧记录，可能属于共用此浏览器的其他人。仅在确认属于你时导入到当前身份；原始记录会继续保留。",
      ))
    )
      return;
    try {
      if (owner !== currentIdentity()) throw new Error("身份已切换，请重试");
      const data = JSON.parse(raw),
        saved = data?.state?.sessions;
      if (!Array.isArray(saved)) throw new Error("旧记录格式无效");
      const store = useChatStore.getState(),
        known = new Set(store.sessions.map((session) => session.id));
      const sessions = saved.filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          Array.isArray(s.messages) &&
          s.mask?.modelConfig &&
          !known.has(s.id),
      );
      store.update((state) => {
        state.sessions = [...sessions, ...state.sessions];
        state.currentSessionIndex = 0;
      });
      setStatus(`已导入 ${sessions.length} 个旧会话，原始记录仍保留。`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  return (
    <div>
      <p className={styles.muted}>
        检测到升级前未分配身份的记录。它们没有自动归入任何账号。
      </p>
      <div className={styles.toolbar}>
        <button onClick={restore}>导入我的旧记录</button>
        <button
          onClick={() =>
            saveFile(
              new Blob([raw], { type: "application/json" }),
              "NextChat-legacy-backup.json",
            )
          }
        >
          备份旧记录
        </button>
      </div>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
