"use client";
import { useState } from "react";
import type { SourceChunk, WebSource } from "../utils/campus-types";
import { CampusDialog } from "./campus-dialog";
import styles from "./campus.module.scss";
import { useFinale } from "../store/finale";
export default function SourceCitations({
  sources = [],
  links = [],
  sessionId,
}: {
  sources?: SourceChunk[];
  links?: WebSource[];
  sessionId?: string;
}) {
  const [selected, setSelected] = useState<SourceChunk | null>(null);
  const unique = sources.filter(
    (s, i) => sources.findIndex((other) => other.label === s.label) === i,
  );
  return (
    <>
      <div className={styles.sourceList} aria-label="回答来源">
        {unique.map((source) => (
          <button
            type="button"
            key={source.label}
            onClick={() => {
              if (source.page && sessionId) {
                useFinale.getState().openPdf(source, sessionId);
                return;
              }
              setSelected({
                ...source,
                text: sources
                  .filter((s) => s.label === source.label)
                  .map((s) => s.text)
                  .join("\n\n…\n\n"),
              });
            }}
          >
            {source.label}
          </button>
        ))}
        {links
          .filter((link) => /^https?:\/\//i.test(link.url))
          .map((link, i) => (
            <a
              href={link.url}
              key={link.url + i}
              target="_blank"
              rel="noopener noreferrer"
            >
              ↗ {link.title || new URL(link.url).hostname}
            </a>
          ))}
      </div>
      {selected && (
        <CampusDialog title={selected.label} onClose={() => setSelected(null)}>
          <p className={styles.muted}>本次回答检索时保存的原文片段</p>
          <div className={styles.sourceText}>{selected.text}</div>
        </CampusDialog>
      )}
    </>
  );
}
