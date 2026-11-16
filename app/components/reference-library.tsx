"use client";
import { useEffect, useState } from "react";
import { CampusDialog } from "./campus-dialog";
import {
  addReferenceDocument,
  listReferenceDocuments,
  removeReferenceDocument,
  ReferenceDocument,
} from "../utils/local-rag";
import styles from "./campus.module.scss";
export default function ReferenceLibrary({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<ReferenceDocument[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    listReferenceDocuments(sessionId)
      .then((docs) => {
        if (active) setDocs(docs);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [sessionId]);
  async function add(files: File[]) {
    if (busy) return;
    setBusy(true);
    setError("");
    const failures: string[] = [];
    for (const file of files) {
      try {
        await addReferenceDocument(sessionId, file);
      } catch (e) {
        failures.push(`${file.name}：${(e as Error).message}`);
      }
    }
    try {
      setDocs(await listReferenceDocuments(sessionId));
    } catch (e) {
      failures.push((e as Error).message);
    }
    setError(failures.join("\n"));
    setBusy(false);
  }
  return (
    <CampusDialog title="本会话资料库" onClose={onClose}>
      <p className={styles.muted}>
        最多 10 份资料，只保存在当前身份的浏览器空间。每次提问检索最相关的 4
        个片段。PDF 保留真实页码；Word 与文本按段落定位。
      </p>
      <label
        className={styles.field}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void add([...e.dataTransfer.files]);
        }}
      >
        添加或拖入资料
        <input
          type="file"
          multiple
          disabled={busy}
          accept=".pdf,.docx,.doc,.xlsx,.csv,.txt,.md"
          onChange={(e) => {
            void add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </label>
      {busy && <p role="status">正在本地解析与索引…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.documentList}>
        {docs.map((doc) => (
          <li key={doc.id}>
            <div>
              <strong>{doc.name}</strong>
              <div className={styles.muted}>
                {doc.characters.toLocaleString()} 字符 · {doc.chunks.length}{" "}
                个片段 · {doc.locator === "page" ? "页码定位" : "段落定位"}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  await removeReferenceDocument(sessionId, doc.id);
                  setDocs(await listReferenceDocuments(sessionId));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              移除
            </button>
          </li>
        ))}
      </ul>
      {!docs.length && !busy && (
        <p className={styles.muted}>还没有资料。添加后，提问时会自动检索。</p>
      )}
    </CampusDialog>
  );
}
