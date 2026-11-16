"use client";
import { useState } from "react";
import type { ChatMessage } from "../store/chat";
import { getMessageTextContent } from "../utils";
import styles from "./finale.module.scss";
export default function TocRail({
  messages,
  onNavigate,
}: {
  messages: ChatMessage[];
  onNavigate: (id: string, heading: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const entries = messages.flatMap((message) => {
    const text = getMessageTextContent(message);
    if (message.role === "user")
      return [
        {
          id: message.id,
          title: text.replace(/\s+/g, " ").slice(0, 65) || "图片 / 附件提问",
          heading: -1,
        },
      ];
    return [
      ...text.replace(/```[\s\S]*?```/g, "").matchAll(/^#{1,2}\s+(.+)$/gm),
    ].map((match, index) => ({
      id: message.id,
      title: match[1],
      heading: index,
    }));
  });
  if (!entries.length) return null;
  return (
    <aside className={styles.toc} aria-label="悬浮章节大纲">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        ☷ {open ? "收起大纲" : "章节大纲"}
      </button>
      {open && (
        <nav>
          {entries.map((entry, i) => (
            <button
              key={entry.id + "-" + i}
              title={entry.title}
              onClick={() => {
                onNavigate(entry.id, entry.heading);
              }}
            >
              {entry.heading < 0 ? "问 · " : "§ "}
              {entry.title}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
