"use client";
import { useState } from "react";
import { parseFlashcards, ankiBlob } from "../utils/anki-export";
import { saveFile } from "../utils/doc-io";
import styles from "./campus.module.scss";
export default function AnkiExporter({ code }: { code: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className={styles.exportBar}>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const deck = parseFlashcards(code);
            await saveFile(await ankiBlob(deck), `${deck.name}.apkg`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在打包牌组…" : "导出 Anki 牌组 (.apkg)"}
      </button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
