"use client";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./campus.module.scss";
export function CampusDialog({
  title,
  children,
  onClose,
  sheet = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  sheet?: boolean;
}) {
  const [mounted, setMounted] = useState(false),
    ref = useRef<HTMLDivElement>(null),
    id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    const opener = document.activeElement as HTMLElement | null;
    ref.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (
        Array.from(document.querySelectorAll("[data-campus-dialog]")).at(-1) !==
        ref.current
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key === "Tab") {
        const list = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]',
          ) ?? []),
        ].filter((el) => el.getClientRects().length);
        const first = list[0],
          last = list.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <div
      className={
        sheet ? styles.backdrop + " " + styles.sheetBackdrop : styles.backdrop
      }
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={styles.dialog}
        data-campus-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header>
          <h2 id={id}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={`关闭${title}`}>
            ×
          </button>
        </header>
        <div className={styles.dialogBody}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
