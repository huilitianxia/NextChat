import { lazyModal } from "./lazy-modal";
import {
  useWorkspacePreferences,
  AppearanceMode,
} from "../store/workspace-preferences";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Path, DEFAULT_CHAT_MODEL } from "../constant";
import { Theme, useAccessStore, useChatStore } from "../store";
import { downloadAs } from "../utils";
import { cacheImageToBase64Image } from "../utils/chat";
import { buildConversationExport } from "../utils/friend-export";
import { IconButton } from "./button";
import { showConfirm } from "./ui-lib";
import LeftIcon from "../icons/left.svg";
import ExportIcon from "../icons/export.svg";
import ClearIcon from "../icons/clear.svg";
import styles from "./settings.module.scss";
import dynamic from "next/dynamic";
const LegacyData = lazyModal(() => import("./legacy-data"), "旧版数据");
const VaultBackup = lazyModal(() => import("./vault-backup"), "加密漫游包");
const CapabilityCheck = dynamic(() => import("./capability-check"), {
  ssr: false,
});

export function Settings() {
  const preferences = useWorkspacePreferences();
  const navigate = useNavigate();
  const access = useAccessStore();
  const chatStore = useChatStore();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const themeNames = {
    [Theme.Auto]: "跟随系统",
    [Theme.Light]: "浅色",
    [Theme.Dark]: "深色",
  };

  async function exportChats() {
    setBusy(true);
    setStatus("");
    try {
      const data = await buildConversationExport(
        chatStore.sessions,
        async (url) => {
          const image = await Promise.race([
            cacheImageToBase64Image(url),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("附件读取超时")), 15000),
            ),
          ]);
          return image;
        },
      );
      await downloadAs(
        JSON.stringify(data, null, 2),
        "NextChat-对话-" + new Date().toISOString().slice(0, 10) + ".json",
      );
      setStatus("对话导出已准备好。");
    } catch {
      setStatus(
        "导出失败，可能有附件缓存无法读取。请检查历史图片后重试；本地对话仍然保留。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function clearData() {
    if (
      !(await showConfirm(
        "将清除当前身份在此浏览器中的对话、资料库和设置，并退出登录，且无法撤销。其他身份与旧版未分区记录会保留。请先导出需要的对话。确定清除吗？",
      ))
    )
      return;
    setBusy(true);
    try {
      await chatStore.clearAllData();
    } catch {
      setStatus("部分数据未能清除，请检查浏览器存储权限后重试。");
      setBusy(false);
    }
  }

  return (
    <main className={styles.settings}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>MAKE IT YOURS</span>
          <h1>偏好设置</h1>
        </div>
        <IconButton
          icon={<LeftIcon />}
          text="返回对话"
          onClick={() => navigate(Path.Chat)}
        />
      </header>
      <section className={styles.card} aria-label="当前身份">
        <span className={styles.badge}>
          {access.friendProfile?.badge || "好友专属空间"}
        </span>
        <h2>{access.friendProfile?.name || "朋友"}的空间</h2>
        <p>对话保存在当前浏览器。切换身份不会删除本机历史。</p>
        <button
          className={styles.link}
          onClick={() => {
            access.clearIdentity();
            navigate(Path.Auth, { replace: true });
          }}
        >
          切换访问身份 ↗
        </button>
      </section>
      <section className={styles.card} aria-label="显示与模型">
        <div className={styles.row}>
          <label htmlFor="friend-theme">
            <strong>外观</strong>
            <span>选择让你舒适的明暗</span>
          </label>
          <select
            id="friend-theme"
            value={preferences.mode}
            onChange={(event) =>
              preferences.setPreferences({
                mode: event.target.value as AppearanceMode,
              })
            }
          >
            {Object.values(Theme).map((theme) => (
              <option key={theme} value={theme}>
                {themeNames[theme]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.row}>
          <label htmlFor="friend-default-model">
            <strong>默认模型</strong>
            <span>新会话固定使用 6.1 Sol；会话内可选择允许的模型</span>
          </label>
          <select id="friend-default-model" value={DEFAULT_CHAT_MODEL} disabled>
            <option value={DEFAULT_CHAT_MODEL}>{DEFAULT_CHAT_MODEL}</option>
          </select>
        </div>
      </section>
      <CapabilityCheck />
      <section className={styles.card} aria-label="本地数据">
        <LegacyData />
        <VaultBackup />
        <div className={styles.row}>
          <div>
            <strong>导出对话</strong>
            <span>保存当前身份的全部对话记录</span>
          </div>
          <IconButton
            icon={<ExportIcon />}
            text="导出"
            aria="导出所有对话"
            bordered
            disabled={busy}
            onClick={exportChats}
          />
        </div>
        <div className={styles.row}>
          <div>
            <strong>清除本地数据</strong>
            <span>仅清空当前身份的对话、资料库和设置</span>
          </div>
          <IconButton
            icon={<ClearIcon />}
            text="清除"
            aria="清除本地数据"
            bordered
            type="danger"
            disabled={busy}
            onClick={clearData}
          />
        </div>
      </section>
      {status && (
        <p role="status" className={styles.status}>
          {status}
        </p>
      )}
      <p className={styles.footnote}>留一点空间，给下一次灵感。</p>
    </main>
  );
}
