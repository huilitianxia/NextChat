"use client";
import { useEffect, useState } from "react";
import { useFinale } from "../store/finale";
import { DEFAULT_MACROS, matchSlash } from "../utils/slash-commands";
import { CampusDialog } from "./campus-dialog";
import styles from "./finale.module.scss";
export function SlashAutocomplete({
  input,
  onSelect,
}: {
  input: string;
  onSelect: (value: string) => void;
}) {
  const macros = useFinale((s) => s.macros),
    matches = matchSlash(input, macros),
    [index, setIndex] = useState(0),
    [dismissed, setDismissed] = useState("");
  const activeIndex = Math.min(index, matches.length - 1),
    open = matches.length > 0 && dismissed !== input;
  useEffect(() => setIndex(0), [input]);
  useEffect(() => {
    const field = document.getElementById("chat-input");
    if (!field || !open) return;
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "ArrowDown") setIndex((activeIndex + 1) % matches.length);
        else if (e.key === "ArrowUp")
          setIndex((activeIndex - 1 + matches.length) % matches.length);
        else if (e.key === "Escape") setDismissed(input);
        else if (matches[activeIndex]) onSelect(matches[activeIndex].prompt);
      }
    };
    field.addEventListener("keydown", key);
    return () => field.removeEventListener("keydown", key);
  }, [open, input, matches, activeIndex, onSelect]);
  if (!open) return null;
  return (
    <div className={styles.slashAnchor}>
      <div
        className={styles.slashList}
        role="listbox"
        aria-label="个人快捷指令"
      >
        {matches.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(m.prompt)}
          >
            /{m.name}
            <small>{m.prompt}</small>
          </button>
        ))}
        <button onClick={() => useFinale.getState().open("macros")}>
          管理个人快捷指令…
        </button>
      </div>
    </div>
  );
}
export default function PromptMacros({ onClose }: { onClose: () => void }) {
  const state = useFinale(),
    [items, setItems] = useState(state.macros.map((m) => ({ ...m }))),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <CampusDialog title="个人快捷指令库" onClose={onClose}>
      <div className={styles.tools}>
        <p className={styles.muted}>
          输入 / 即可选择。按用户保存在当前浏览器；不会自动发送。
        </p>
        {items.map((item, index) => (
          <div className={styles.card} key={item.id}>
            <div className={styles.grid}>
              <label>
                指令名称（不含 /）
                <input
                  value={item.name}
                  maxLength={24}
                  onChange={(e) => {
                    setSaved(false);
                    setItems((all) =>
                      all.map((v, i) =>
                        i === index ? { ...v, name: e.target.value } : v,
                      ),
                    );
                  }}
                />
              </label>
              <div className={styles.toolbar}>
                <button
                  onClick={() => {
                    setSaved(false);
                    setItems((all) => all.filter((_, i) => i !== index));
                  }}
                >
                  删除此指令
                </button>
              </div>
            </div>
            <label>
              提示词
              <textarea
                rows={3}
                value={item.prompt}
                maxLength={12000}
                onChange={(e) => {
                  setSaved(false);
                  setItems((all) =>
                    all.map((v, i) =>
                      i === index ? { ...v, prompt: e.target.value } : v,
                    ),
                  );
                }}
              />
            </label>
          </div>
        ))}
        <div className={styles.toolbar}>
          <button
            disabled={items.length >= 60}
            onClick={() => {
              setSaved(false);
              setItems([
                ...items,
                { id: crypto.randomUUID(), name: "", prompt: "" },
              ]);
            }}
          >
            添加指令
          </button>
          <button
            onClick={() => {
              setSaved(false);
              setItems(DEFAULT_MACROS.map((m) => ({ ...m })));
            }}
          >
            恢复默认（保存后生效）
          </button>
          <button
            onClick={() => {
              try {
                state.saveMacros(items);
                setError("");
                setSaved(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            保存指令
          </button>
        </div>
        {saved && <p role="status">已保存到当前用户。</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </CampusDialog>
  );
}
