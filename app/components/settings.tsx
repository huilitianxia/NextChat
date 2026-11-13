import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Path, ServiceProvider } from "../constant";
import { Theme, useAccessStore, useAppConfig, useChatStore } from "../store";
import { downloadAs } from "../utils";
import { useAllModels } from "../utils/hooks";
import { cacheImageToBase64Image } from "../utils/chat";
import { buildConversationExport } from "../utils/friend-export";
import { IconButton } from "./button";
import { showConfirm } from "./ui-lib";
import LeftIcon from "../icons/left.svg";
import ExportIcon from "../icons/export.svg";
import ClearIcon from "../icons/clear.svg";
import styles from "./settings.module.scss";

export function Settings() {
  const navigate = useNavigate();
  const config = useAppConfig();
  const access = useAccessStore();
  const chatStore = useChatStore();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const models = useAllModels().filter(
    (model) =>
      model.available &&
      model.provider?.providerName === ServiceProvider.OpenAI,
  );
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
        "将清除这个浏览器中的所有对话、附件缓存、设置和登录身份，且无法撤销。请先导出需要保留的对话。确定清除吗？",
      ))
    )
      return;
    setBusy(true);
    try {
      if ("caches" in window) {
        await Promise.all(
          ["chatgpt-next-web-cache", "chatgpt-next-web-file"].map((key) =>
            caches.delete(key),
          ),
        );
      }
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
            value={config.theme}
            onChange={(event) =>
              config.update((state) => {
                state.theme = event.target.value as Theme;
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
            <span>用于新建对话；当前对话可单独切换</span>
          </label>
          <select
            id="friend-default-model"
            value={config.modelConfig.model}
            disabled={!models.length}
            onChange={(event) =>
              config.update((state) => {
                state.modelConfig.model = event.target.value;
                state.modelConfig.providerName = ServiceProvider.OpenAI;
              })
            }
          >
            {!models.some(
              (model) => model.name === config.modelConfig.model,
            ) && (
              <option value={config.modelConfig.model}>
                {config.modelConfig.model}
              </option>
            )}
            {models.map((model) => (
              <option key={model.name} value={model.name}>
                {model.displayName || model.name}
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className={styles.card} aria-label="本地数据">
        <div className={styles.row}>
          <div>
            <strong>导出对话</strong>
            <span>保存当前浏览器的全部对话记录</span>
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
            <span>清空对话、附件缓存、设置及登录身份</span>
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
