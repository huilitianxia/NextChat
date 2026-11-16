"use client";
import { useEffect, useState } from "react";
import { MAJOR_QUOTES, WORKSPACE_QUOTES } from "../config/workflow-templates";
import { Major } from "../config/user-profiles";
import styles from "./campus.module.scss";
export function WorkspaceQuote({ major = "research" }: { major?: Major }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => i + 1);
    }, 45000);
    return () => clearInterval(timer);
  }, []);
  const quotes = [MAJOR_QUOTES[major], ...WORKSPACE_QUOTES];
  return (
    <div className={styles.quote}>
      <span>{quotes[index % quotes.length]}</span>
      <button
        type="button"
        aria-label="换一句鼓励"
        title="换一句"
        onClick={() => setIndex((i) => i + 1)}
      >
        ↻
      </button>
    </div>
  );
}
