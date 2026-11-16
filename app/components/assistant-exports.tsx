"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  codeBlocks,
  hasTables,
  saveFile,
  wordBlob,
  excelBlob,
  codeZipBlob,
} from "../utils/doc-io";
import styles from "./campus.module.scss";
const ChemViewer = dynamic(() => import("./chem-viewer"), { ssr: false });
const SlidesPreview = dynamic(() => import("./slides-preview"), { ssr: false });
export default function AssistantExports({ content }: { content: string }) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function download(kind: string) {
    setBusy(kind);
    setError("");
    try {
      const blob =
        kind === "docx"
          ? await wordBlob(content)
          : kind === "xlsx"
          ? await excelBlob(content)
          : await codeZipBlob(content);
      await saveFile(
        blob,
        `NextChat-${new Date().toISOString().slice(0, 10)}.${kind}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const tags = [
    ...content.matchAll(/<smiles>\s*([^<>\n]+)\s*<\/smiles>/gi),
  ].slice(0, 5);
  if (!content.trim()) return null;
  return (
    <>
      <SlidesPreview content={content} />
      {tags.map((tag, i) => (
        <ChemViewer key={i} code={tag[1]} />
      ))}
      <div className={styles.exportBar} aria-label="回复导出">
        <button disabled={!!busy} onClick={() => download("docx")}>
          导出 Word (.docx)
        </button>
        {hasTables(content) && (
          <button disabled={!!busy} onClick={() => download("xlsx")}>
            导出 Excel (.xlsx)
          </button>
        )}
        {codeBlocks(content).length >= 2 && (
          <button disabled={!!busy} onClick={() => download("zip")}>
            打包下载 (.zip)
          </button>
        )}
        {busy && <span role="status">正在导出…</span>}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}
