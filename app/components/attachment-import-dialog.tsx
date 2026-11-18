"use client";

import { useState } from "react";
import {
  AttachmentBudget,
  attachmentCharacterCount,
  attachmentOverflowLabel,
  attachmentPrefixPercent,
  numberLabel,
} from "../utils/attachment-policy";
import {
  AttachmentTextLimitError,
  PdfPageRange,
  pdfPageLabel,
  validPdfRange,
} from "../utils/attachments";
import { CampusDialog } from "./campus-dialog";
import styles from "./chat.module.scss";

export type AttachmentImportChoice = "prefix" | PdfPageRange | null;

export function AttachmentImportDialog({
  fileName,
  overflow,
  budget,
  alreadyAttached,
  onChoice,
}: {
  fileName: string;
  overflow: AttachmentTextLimitError;
  budget: AttachmentBudget;
  alreadyAttached: number;
  onChoice: (choice: AttachmentImportChoice) => void;
}) {
  const pdf = overflow.pdf;
  const [start, setStart] = useState(String(pdf?.range?.start ?? 1));
  const [end, setEnd] = useState(String(pdf?.range?.end ?? 1));
  const [error, setError] = useState("");
  const kept = attachmentCharacterCount(overflow.prefix);
  return (
    <CampusDialog title="文档超出附件字符上限" onClose={() => onChoice(null)}>
      <div className={styles["attachment-import"]}>
        <p>
          <strong>{fileName}</strong>
          {pdf && ` · 共 ${numberLabel(pdf.pages)} 页`}
          {pdf?.range && ` · 当前范围 ${pdfPageLabel(pdf.range)}`}
        </p>
        <p>
          {attachmentOverflowLabel(
            overflow.characterCount,
            budget,
            alreadyAttached,
          )}
        </p>
        {pdf && (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              const range = { start: Number(start), end: Number(end) };
              if (!validPdfRange(range, pdf.pages)) {
                setError(
                  `请输入 1 至 ${numberLabel(
                    pdf.pages,
                  )} 之间的整数，结束页不能小于起始页。`,
                );
                return;
              }
              onChoice(range);
            }}
          >
            <div className={styles["attachment-page-fields"]}>
              <label>
                起始页码
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={pdf.pages}
                  value={start}
                  onChange={(event) => {
                    setStart(event.target.value);
                    setError("");
                  }}
                />
              </label>
              <label>
                结束页码
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={pdf.pages}
                  value={end}
                  onChange={(event) => {
                    setEnd(event.target.value);
                    setError("");
                  }}
                />
              </label>
            </div>
            {error && (
              <p className={styles["attachment-error"]} role="alert">
                {error}
              </p>
            )}
            <button type="submit">按页码范围导入</button>
          </form>
        )}
        <div className={styles["attachment-import-actions"]}>
          <button type="button" onClick={() => onChoice("prefix")}>
            自动截取前部内容导入
          </button>
          <button type="button" onClick={() => onChoice(null)}>
            取消导入
          </button>
        </div>
        <p className={styles["attachment-import-detail"]}>
          自动截取将载入{pdf?.range ? "所选页码内" : "文档"}的前{" "}
          {attachmentPrefixPercent(kept, overflow.characterCount)}（
          {numberLabel(kept)} 字符）。
        </p>
      </div>
    </CampusDialog>
  );
}
