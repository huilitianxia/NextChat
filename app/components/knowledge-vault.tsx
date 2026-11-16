"use client";
import { useEffect, useMemo, useState } from "react";
import { CampusDialog } from "./campus-dialog";
import { useCapstone } from "../store/capstone";
import { currentIdentity } from "../utils/identity-storage";
import {
  KnowledgeNote,
  filterKnowledge,
  listKnowledge,
  normalizeTags,
  removeKnowledge,
  saveKnowledge,
} from "../utils/knowledge-vault";
import styles from "./capstone.module.scss";
export default function KnowledgeVault({ onClose }: { onClose: () => void }) {
  const clip = useCapstone((s) => s.clip),
    [notes, setNotes] = useState<KnowledgeNote[]>([]),
    [tag, setTag] = useState(""),
    [query, setQuery] = useState(""),
    [checked, setChecked] = useState<string[]>([]),
    [edit, setEdit] = useState<Partial<KnowledgeNote> | null>(
      clip
        ? {
            title: clip.content.replace(/^[#\s]+/, "").slice(0, 60),
            content: clip.content,
            source: { sessionId: clip.sessionId, messageId: clip.messageId },
          }
        : null,
    ),
    [tags, setTags] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const owner = currentIdentity();
  useEffect(() => {
    let active = true;
    listKnowledge()
      .then((n) => {
        if (active) setNotes(n);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const visible = useMemo(
      () => filterKnowledge(notes, tag, query),
      [notes, tag, query],
    ),
    allTags = [...new Set(notes.flatMap((n) => n.tags))].sort();
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
  const selected = notes.filter((n) => checked.includes(n.id));
  return (
    <CampusDialog
      title="知识手账"
      onClose={() => {
        useCapstone.setState({ clip: null });
        onClose();
      }}
    >
      <div className={styles.panel}>
        <p>跨会话收藏，保存在当前用户的浏览器分区。</p>
        <div className={styles.row}>
          <button
            disabled={busy}
            onClick={() => {
              setEdit({ title: "", content: "" });
              setTags("");
            }}
          >
            新建笔记
          </button>
          <span>
            {notes.length} 条笔记 · 已选 {selected.length} 条
          </span>
        </div>
        {edit && (
          <section className={styles.note} aria-label="编辑知识笔记">
            <label>
              笔记标题
              <input
                maxLength={200}
                value={edit.title || ""}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label>
              课程标签
              <input
                placeholder="#药理 #有机 #模电 #算法"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </label>
            <label>
              笔记内容
              <textarea
                rows={7}
                maxLength={120000}
                value={edit.content || ""}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              />
            </label>
            <div className={styles.row}>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const n = await saveKnowledge({
                      id: edit.id,
                      title: edit.title || "",
                      content: edit.content || "",
                      tags: normalizeTags(tags),
                      source: edit.source,
                    });
                    if (owner === currentIdentity()) {
                      setNotes(n);
                      setEdit(null);
                      useCapstone.setState({ clip: null });
                      setStatus("已保存到知识手账。");
                    }
                  })
                }
              >
                保存笔记
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  setEdit(null);
                  useCapstone.setState({ clip: null });
                }}
              >
                取消编辑
              </button>
            </div>
          </section>
        )}
        <div className={styles.grid}>
          <label>
            筛选课程
            <select
              value={tag}
              onChange={(e) => {
                setTag(e.target.value);
                setChecked([]);
              }}
            >
              <option value="">全部课程</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </label>
          <label>
            搜索笔记
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setChecked([]);
              }}
            />
          </label>
        </div>
        <div className={styles.row}>
          <button
            disabled={busy || !visible.length}
            onClick={() => setChecked(visible.map((n) => n.id))}
          >
            全选当前结果
          </button>
          <button onClick={() => setChecked([])}>清空选择</button>
          {(["docx", "apkg"] as const).map((format) => (
            <button
              key={format}
              disabled={busy || !selected.length}
              onClick={() =>
                void run(async () => {
                  const { saveFile } = await import("../utils/doc-io"),
                    { examSheetBlob, knowledgeDeck } = await import(
                      "../utils/exam-cheatsheet"
                    );
                  const blob =
                    format === "docx"
                      ? await examSheetBlob(selected)
                      : await (
                          await import("../utils/anki-export")
                        ).ankiBlob(knowledgeDeck(selected));
                  if (owner === currentIdentity())
                    await saveFile(blob, `知识手账-${tag || "全部"}.${format}`);
                })
              }
            >
              {format === "docx"
                ? "A4 双栏期末小抄 (.docx)"
                : "合并 Anki (.apkg)"}
            </button>
          ))}
        </div>
        {visible.map((note) => (
          <article key={note.id} className={styles.note}>
            <label className={styles.inline}>
              <input
                type="checkbox"
                checked={checked.includes(note.id)}
                onChange={(e) =>
                  setChecked((ids) =>
                    e.target.checked
                      ? [...ids, note.id]
                      : ids.filter((id) => id !== note.id),
                  )
                }
              />
              <strong>{note.title}</strong>
            </label>
            <small>{note.tags.map((t) => "#" + t).join(" ") || "未分类"}</small>
            <pre>
              {note.content.slice(0, 420)}
              {note.content.length > 420 ? "…" : ""}
            </pre>
            <div className={styles.row}>
              <button
                disabled={busy}
                onClick={() => {
                  setEdit(note);
                  setTags(note.tags.join(" "));
                }}
              >
                编辑
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setNotes(await removeKnowledge(note.id));
                    setChecked((ids) => ids.filter((id) => id !== note.id));
                  })
                }
              >
                删除
              </button>
            </div>
          </article>
        ))}
        {!visible.length && (
          <p>还没有符合条件的笔记。可从回复或划词工具栏收藏。</p>
        )}
        {busy && <p role="status">正在处理…</p>}
        {status && <p role="status">{status}</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </CampusDialog>
  );
}
