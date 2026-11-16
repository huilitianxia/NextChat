"use client";
import { useState } from "react";
import {
  Citation,
  EMPTY_CITATION,
  parseReference,
  formatCitation,
  citationMissing,
  lookupDoi,
} from "../utils/citation-formatter";
import { saveFile } from "../utils/doc-io";
import { copyToClipboard } from "../utils";
import { CampusDialog } from "./campus-dialog";
import styles from "./finale.module.scss";
export default function CitationFormatter({
  onClose,
}: {
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(""),
    [value, setValue] = useState<Citation>({ ...EMPTY_CITATION }),
    [style, setStyle] = useState<"gb" | "apa" | "ieee" | "bib">("gb"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const missing = citationMissing(value);
  let formatted = "";
  if (!missing.length) {
    try {
      formatted = formatCitation(value, style);
    } catch {}
  }
  const change = (key: keyof Citation, text: string) =>
    setValue((v) => ({
      ...v,
      [key]:
        key === "authors"
          ? text
              .split(/[;；]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : text,
    }));
  return (
    <CampusDialog title="参考文献格式化器" onClose={onClose}>
      <div className={styles.tools}>
        <label>
          DOI、arXiv 链接，或逐行原始字段
          <textarea
            rows={3}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={
              "作者: Smith, Jane; 李明\n标题: …\n年份: 2026\n期刊: …"
            }
          />
        </label>
        <div className={styles.toolbar}>
          <button
            onClick={() => {
              try {
                setValue(parseReference(raw));
                setError("");
                setNotice("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            解析信息
          </button>
          <button
            disabled={!value.doi || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              const controller = new AbortController(),
                timer = setTimeout(() => controller.abort(), 12000);
              try {
                setValue(await lookupDoi(value.doi, controller.signal));
                setNotice("已从 Crossref 读取；请核对作者、标题与年份。");
              } catch {
                setError("无法读取公开元数据，可继续手动填写。");
              } finally {
                clearTimeout(timer);
                setBusy(false);
              }
            }}
          >
            {busy ? "读取中…" : "通过 DOI 补全公开元数据"}
          </button>
        </div>
        <p className={styles.muted}>
          标识符可离线解析。DOI 补全仅在点击后直连
          Crossref；不会发送对话或登录信息。arXiv 请补充论文元数据。
        </p>
        <div className={styles.grid}>
          <label>
            类型
            <select
              value={value.type}
              onChange={(e) => change("type", e.target.value)}
            >
              <option value="article">期刊论文</option>
              <option value="book">图书</option>
              <option value="preprint">预印本</option>
            </select>
          </label>
          <label>
            作者（分号分隔；英文用 姓, 名）
            <input
              value={value.authors.join("; ")}
              onChange={(e) => change("authors", e.target.value)}
            />
          </label>
          {(
            [
              ["title", "标题"],
              ["year", "年份"],
              ["journal", "期刊"],
              ["volume", "卷"],
              ["issue", "期"],
              ["pages", "页码"],
              ["publisher", "出版社"],
              ["place", "出版地"],
              ["doi", "DOI"],
              ["arxiv", "arXiv ID"],
              ["url", "来源链接"],
              ["accessed", "引用日期 YYYY-MM-DD"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={value[key]}
                onChange={(e) => change(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className={styles.toolbar} role="group" aria-label="引用格式">
          {(
            [
              ["gb", "GB/T 7714-2015"],
              ["ieee", "IEEE"],
              ["apa", "APA 7th"],
              ["bib", "BibTeX"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={style === key}
              onClick={() => setStyle(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {missing.length ? (
          <p className={styles.muted}>
            待补充：{missing.join("、")}。不会自动猜测缺失资料。
          </p>
        ) : (
          <div className={styles.output} data-testid="formatted-citation">
            {formatted}
          </div>
        )}
        <div className={styles.toolbar}>
          <button
            disabled={!formatted}
            onClick={async () => {
              if (await copyToClipboard(formatted)) setNotice("已复制引用。");
              else setError("自动复制不可用，请选中上方引用手动复制。");
            }}
          >
            复制引用
          </button>
          <button
            disabled={!formatted}
            onClick={() =>
              void saveFile(
                new Blob([formatCitation(value, "bib")], {
                  type: "application/x-bibtex;charset=utf-8",
                }),
                "reference.bib",
              )
            }
          >
            导出 .bib
          </button>
          <button
            disabled={!formatted}
            onClick={() =>
              void saveFile(
                new Blob([formatted], { type: "text/plain;charset=utf-8" }),
                "reference.txt",
              )
            }
          >
            导出文本
          </button>
        </div>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <small>
          支持期刊、图书和预印本的常见格式；正式提交前按学校要求复核大小写、斜体及特殊文献类型。
        </small>
      </div>
    </CampusDialog>
  );
}
