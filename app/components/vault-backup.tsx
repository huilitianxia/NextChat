"use client";
import { useState } from "react";
import { CampusDialog } from "./campus-dialog";
import { currentIdentity } from "../utils/identity-storage";
import { collectStudyData, importStudyData } from "../utils/vault-backup";
import { StudyPayload, validateStudyPayload } from "../utils/vault-merge";
import {
  decryptVault,
  encryptVault,
  VAULT_MAX_BYTES,
} from "../utils/vault-crypto";
import styles from "./capstone.module.scss";
export default function VaultBackup() {
  const [mode, setMode] = useState<"export" | "import" | null>(null),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState<StudyPayload | null>(null),
    [theme, setTheme] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const owner = currentIdentity();
  function close() {
    if (busy) return;
    setMode(null);
    setPassword("");
    setConfirm("");
    setFile(null);
    setPending(null);
    setError("");
    setStatus("");
    setTheme(false);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <button onClick={() => setMode("export")}>导出加密漫游包</button>
        <button onClick={() => setMode("import")}>导入并合并漫游包</button>
      </div>
      {mode && (
        <CampusDialog
          title={mode === "export" ? "导出加密漫游包" : "导入并合并漫游包"}
          onClose={close}
        >
          <div className={styles.panel}>
            <p>
              包含当前用户的会话、知识笔记、快捷指令和主题。口令不会保存；忘记口令无法恢复。
            </p>
            <small>
              资料库原文件、附件原始文件和执行环境不在包内；会话中的文字、已缓存图片与引用片段会保留。其他设备上的同
              ID 冲突会作为副本导入。
            </small>
            {mode === "import" && (
              <label>
                选择 .campus-vault 文件
                <input
                  type="file"
                  accept=".campus-vault,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setPending(null);
                    setStatus("");
                  }}
                />
              </label>
            )}
            {!pending && (
              <label>
                漫游口令
                <input
                  type="password"
                  autoComplete="new-password"
                  maxLength={1024}
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {mode === "export" && (
              <>
                <label>
                  再次输入口令
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    maxLength={1024}
                    disabled={busy}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (password !== confirm)
                        throw new Error("两次口令不一致。");
                      const data = await collectStudyData(),
                        envelope = await encryptVault(data, password);
                      if (owner !== currentIdentity()) return;
                      const { saveFile } = await import("../utils/doc-io");
                      await saveFile(
                        new Blob([JSON.stringify(envelope)], {
                          type: "application/json",
                        }),
                        `学习漫游-${new Date()
                          .toISOString()
                          .slice(0, 10)}.campus-vault`,
                      );
                      setPassword("");
                      setConfirm("");
                      setStatus(
                        `已导出 ${data.sessions.length} 个会话、${data.notes.length} 条知识笔记。`,
                      );
                    })
                  }
                >
                  加密并下载
                </button>
              </>
            )}
            {mode === "import" && !pending && (
              <button
                disabled={busy || !file}
                onClick={() =>
                  void run(async () => {
                    if (!file || file.size > VAULT_MAX_BYTES * 1.4)
                      throw new Error("漫游包过大。");
                    const data = validateStudyPayload(
                      await decryptVault(
                        JSON.parse(await file.text()),
                        password,
                      ),
                    );
                    if (owner === currentIdentity()) {
                      setPending(data);
                      setPassword("");
                    }
                  })
                }
              >
                解密并预览
              </button>
            )}
            {pending && (
              <>
                <div className={styles.stats}>
                  {pending.sessions.length} 个会话 · {pending.notes.length}{" "}
                  条知识笔记 · {pending.macros.length} 条快捷指令
                </div>
                <label className={styles.inline}>
                  <input
                    type="checkbox"
                    checked={theme}
                    disabled={busy}
                    onChange={(e) => setTheme(e.target.checked)}
                  />
                  同时应用包内主题
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await importStudyData(pending, theme);
                      if (owner === currentIdentity()) {
                        setPending(null);
                        setFile(null);
                        setStatus(
                          `合并完成：新增 ${result.sessions} 个会话、${result.notes} 条笔记、${result.macros} 条指令；${result.conflicts} 项冲突保留为副本，${result.skipped} 项重复已跳过。`,
                        );
                      }
                    })
                  }
                >
                  确认合并到当前用户
                </button>
              </>
            )}
            {busy && <p role="status">正在本机处理，请稍候…</p>}
            {status && <p role="status">{status}</p>}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
          </div>
        </CampusDialog>
      )}
    </div>
  );
}
