"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SELECTION_ACTIONS, selectionPrompt } from "../utils/selection-actions";
import styles from "./polish.module.scss";
import { clipToVault } from "../store/capstone";
import { useChatStore } from "../store/chat";
export default function SelectionActions({
  onPrompt,
}: {
  onPrompt: (text: string) => void;
}) {
  const [selection, setSelection] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const inspect = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const value = window.getSelection();
        if (
          !value ||
          value.isCollapsed ||
          !value.rangeCount ||
          !value.toString().trim()
        ) {
          setSelection(null);
          return;
        }
        const range = value.getRangeAt(0);
        const element = (node: Node) =>
          (node.nodeType === Node.ELEMENT_NODE
            ? (node as Element)
            : node.parentElement
          )?.closest("[data-assistant-message]");
        const start = element(range.startContainer),
          end = element(range.endContainer);
        if (!start || start !== end || value.toString().length > 12000) {
          setSelection(null);
          return;
        }
        const rect = range.getBoundingClientRect(),
          width = Math.min(470, innerWidth - 24);
        if (rect.bottom <= 0 || rect.top >= innerHeight) {
          setSelection(null);
          return;
        }
        setSelection({
          text: value.toString(),
          left: Math.max(
            12,
            Math.min(
              rect.left + rect.width / 2 - width / 2,
              innerWidth - width - 12,
            ),
          ),
          top: Math.max(8, rect.top - (innerWidth < 600 ? 88 : 52)),
        });
      }, 140);
    };
    const hide = () => setSelection(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("selectionchange", inspect);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", inspect);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", key);
    };
  }, []);
  if (!selection) return null;
  return createPortal(
    <div
      role="toolbar"
      aria-label="划词操作"
      className={styles.selectionPill}
      style={{ top: selection.top, left: selection.left }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {SELECTION_ACTIONS.map((action) => (
        <button
          type="button"
          key={action}
          onClick={() => {
            onPrompt(selectionPrompt(action, selection.text));
            setSelection(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          {action}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          void clipToVault({
            content: selection.text,
            sessionId: useChatStore.getState().currentSession().id,
          });
          setSelection(null);
          window.getSelection()?.removeAllRanges();
        }}
      >
        收藏到知识手账
      </button>
    </div>,
    document.body,
  );
}
