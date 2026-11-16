"use client";
import { useEffect, useRef, useState } from "react";
import { useCampusUI } from "../store/campus";
import { saveFile } from "../utils/doc-io";
import { renderedPng } from "../utils/message-image";
import {
  EQUATION_SYMBOLS,
  EQUATION_PRESETS,
  EquationSymbol,
  insertEquation,
} from "../utils/equation-editor";
import { CampusDialog } from "./campus-dialog";
import styles from "./finale.module.scss";
import junior from "./junior.module.scss";
export default function EquationScratchpad({
  onClose,
}: {
  onClose: () => void;
}) {
  const [tex, setTex] = useState(""),
    [category, setCategory] = useState("微积分"),
    [katex, setKatex] = useState<typeof import("katex") | null>(null),
    [inline, setInline] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null),
    preview = useRef<HTMLDivElement>(null),
    selection = useRef({ start: 0, end: 0 });
  useEffect(() => {
    let active = true;
    import("katex")
      .then((k) => {
        if (active) setKatex(k);
      })
      .catch(() => {
        if (active) setError("公式渲染器未能加载，请重新打开草稿本。");
      });
    return () => {
      active = false;
    };
  }, []);
  let html = "",
    renderError = "";
  if (katex && tex.trim())
    try {
      html = katex.renderToString(tex, {
        throwOnError: true,
        trust: false,
        strict: "error",
        displayMode: !inline,
      });
    } catch (e) {
      renderError = (e as Error).message;
    }
  const mini = (symbol: EquationSymbol) => {
    try {
      return (
        katex?.renderToString(symbol.preview || symbol.tex, {
          throwOnError: false,
          trust: false,
          displayMode: false,
        }) || ""
      );
    } catch {
      return "";
    }
  };
  function symbol(value: EquationSymbol) {
    try {
      const next = insertEquation(
        tex,
        selection.current.start,
        selection.current.end,
        value,
      );
      setTex(next.value);
      setNotice("");
      setError("");
      requestAnimationFrame(() => {
        editor.current?.focus();
        editor.current?.setSelectionRange(next.cursor, next.cursor);
        selection.current = { start: next.cursor, end: next.cursor };
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <CampusDialog title="公式草稿本" onClose={onClose}>
      <div className={styles.tools}>
        <p className={junior.subtitle}>
          点击下方可视化符号插入模板（选中文本后再点分式/根号可自动包裹），支持一键插入对话或复制透明高清公式图
        </p>
        <div className={styles.toolbar}>
          {Object.keys(EQUATION_SYMBOLS).map((key) => (
            <button
              key={key}
              aria-pressed={category === key}
              onClick={() => setCategory(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <div className={junior.symbols}>
          {EQUATION_SYMBOLS[category].map((s) => (
            <button
              key={s.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => symbol(s)}
              title={s.preview || s.tex}
              aria-label={s.label}
            >
              <span aria-hidden dangerouslySetInnerHTML={{ __html: mini(s) }} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className={styles.toolbar} aria-label="经典 STEM 公式预设">
          {EQUATION_PRESETS.map((p) => (
            <button
              key={p.label}
              title="填入整条公式"
              onClick={() => {
                setTex(p.tex);
                setNotice("");
                selection.current = { start: p.tex.length, end: p.tex.length };
                editor.current?.focus();
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={junior.editorHead}>
          <label htmlFor="scratchpad-tex">LaTeX 公式</label>
          <button
            onClick={() => {
              setTex("");
              setNotice("");
              setError("");
              selection.current = { start: 0, end: 0 };
              editor.current?.focus();
            }}
          >
            清空
          </button>
        </div>
        <textarea
          id="scratchpad-tex"
          aria-label="LaTeX 公式"
          ref={editor}
          rows={4}
          maxLength={6000}
          value={tex}
          placeholder="例如：\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}"
          onSelect={(e) => {
            selection.current = {
              start: e.currentTarget.selectionStart,
              end: e.currentTarget.selectionEnd,
            };
          }}
          onChange={(e) => {
            setTex(e.target.value);
            selection.current = {
              start: e.target.selectionStart,
              end: e.target.selectionEnd,
            };
            setNotice("");
          }}
        />
        <div
          className={styles.formula}
          ref={preview}
          aria-label="公式实时预览"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!tex.trim() && (
          <p className={junior.note}>
            从符号或经典公式开始，也可以直接输入 LaTeX。
          </p>
        )}
        <div className={junior.formulaBar}>
          <div className={junior.segments}>
            <button aria-pressed={inline} onClick={() => setInline(true)}>
              行内公式 ($...$)
            </button>
            <button aria-pressed={!inline} onClick={() => setInline(false)}>
              独立公式块 ($$...$$)
            </button>
          </div>
          <div className={styles.toolbar}>
            <button
              disabled={!html || busy}
              onClick={() => {
                useCampusUI.getState().dispatch({
                  kind: "append",
                  text: inline ? `$${tex}$` : `\n$$\n${tex}\n$$\n`,
                });
                onClose();
              }}
            >
              插入输入框
            </button>
            <button
              disabled={!html || busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const blob = await renderedPng(preview.current!, 3, {
                    transparent: true,
                  });
                  if (
                    navigator.clipboard?.write &&
                    typeof ClipboardItem !== "undefined"
                  )
                    try {
                      await navigator.clipboard.write([
                        new ClipboardItem({ "image/png": blob }),
                      ]);
                      setNotice("透明高清公式 PNG 已复制。");
                      return;
                    } catch {}
                  await saveFile(blob, "equation.png");
                  setNotice("浏览器不支持图片剪贴板，已下载透明 PNG。");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              复制 PNG
            </button>
          </div>
        </div>
        {(error || renderError) && (
          <p role="alert" className={styles.error}>
            {error || renderError}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </CampusDialog>
  );
}
