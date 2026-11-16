"use client";
import { useEffect, useRef, useState } from "react";
import { useCampusUI } from "../store/campus";
import { saveFile } from "../utils/doc-io";
import { renderedPng } from "../utils/message-image";
import { CampusDialog } from "./campus-dialog";
import styles from "./finale.module.scss";
const SYMBOLS = {
  微积分: [
    ["积分", "\\int_{a}^{b} f(x)\\,dx"],
    ["导数", "\\frac{d}{dx}"],
    ["偏导", "\\frac{\\partial f}{\\partial x}"],
    ["极限", "\\lim_{x\\to 0}"],
    ["求和", "\\sum_{i=1}^{n}"],
    ["分数", "\\frac{a}{b}"],
    ["根号", "\\sqrt{x}"],
  ],
  矩阵: [
    ["2×2", "\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}"],
    ["方程组", "\\begin{cases}x+y=1\\\\x-y=0\\end{cases}"],
    ["向量", "\\vec{v}"],
    ["行列式", "\\det(A)"],
    ["转置", "A^{\\mathsf T}"],
  ],
  希腊: [
    ["α", "\\alpha"],
    ["β", "\\beta"],
    ["γ", "\\gamma"],
    ["Δ", "\\Delta"],
    ["ε", "\\epsilon"],
    ["θ", "\\theta"],
    ["λ", "\\lambda"],
    ["μ", "\\mu"],
    ["π", "\\pi"],
    ["ω", "\\omega"],
  ],
  "电路 / 化学": [
    ["Ω", "\\Omega"],
    ["阻抗", "Z=R+j\\omega L"],
    ["反应", "\\mathrm{A} \\rightarrow \\mathrm{B}"],
    ["平衡", "\\rightleftharpoons"],
    ["条件箭头", "\\xrightarrow{\\Delta}"],
    ["下标", "_{2}"],
    ["上标", "^{+}"],
  ],
};
export default function EquationScratchpad({
  onClose,
}: {
  onClose: () => void;
}) {
  const [tex, setTex] = useState("E=mc^2"),
    [category, setCategory] = useState<keyof typeof SYMBOLS>("微积分"),
    [html, setHtml] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [inline, setInline] = useState(false),
    [busy, setBusy] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null),
    preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void import("katex").then((katex) => {
      try {
        const result = katex.renderToString(tex, {
          throwOnError: true,
          trust: false,
          strict: "error",
          displayMode: !inline,
        });
        if (active) {
          setHtml(result);
          setError("");
        }
      } catch (e) {
        if (active) {
          setHtml("");
          setError((e as Error).message);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [tex, inline]);
  function symbol(value: string) {
    const field = editor.current,
      start = field?.selectionStart ?? tex.length,
      end = field?.selectionEnd ?? start;
    setTex(tex.slice(0, start) + value + tex.slice(end));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + value.length, start + value.length);
    });
  }
  return (
    <CampusDialog title="公式草稿本" onClose={onClose}>
      <div className={styles.tools}>
        <div className={styles.toolbar}>
          {Object.keys(SYMBOLS).map((key) => (
            <button
              key={key}
              aria-pressed={category === key}
              onClick={() => setCategory(key as keyof typeof SYMBOLS)}
            >
              {key}
            </button>
          ))}
        </div>
        <div className={styles.symbols}>
          {SYMBOLS[category].map(([name, value]) => (
            <button key={name} onClick={() => symbol(value)} title={value}>
              {name}
            </button>
          ))}
        </div>
        <label>
          LaTeX 公式
          <textarea
            aria-label="LaTeX 公式"
            ref={editor}
            rows={4}
            maxLength={6000}
            value={tex}
            onChange={(e) => setTex(e.target.value)}
          />
        </label>
        <div
          className={styles.formula}
          ref={preview}
          aria-label="公式实时预览"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <div className={styles.toolbar}>
          <label>
            <input
              type="checkbox"
              checked={inline}
              onChange={(e) => setInline(e.target.checked)}
            />
            行内公式
          </label>
          <button
            disabled={!html}
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
              try {
                const blob = await renderedPng(preview.current!);
                if (
                  navigator.clipboard?.write &&
                  typeof ClipboardItem !== "undefined"
                ) {
                  try {
                    await navigator.clipboard.write([
                      new ClipboardItem({ "image/png": blob }),
                    ]);
                    setNotice("公式 PNG 已复制。");
                    return;
                  } catch {}
                }
                await saveFile(blob, "equation.png");
                setNotice("浏览器不支持图片剪贴板，已下载 PNG。");
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
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </CampusDialog>
  );
}
