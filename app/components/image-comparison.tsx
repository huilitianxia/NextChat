"use client";
import { useState } from "react";
import type { ImageRevision } from "../utils/campus-types";
import { saveFile } from "../utils/doc-io";
import styles from "./campus.module.scss";
export default function ImageComparison({
  revision,
  onEdit,
}: {
  revision: ImageRevision;
  onEdit?: () => void;
}) {
  const [position, setPosition] = useState(50),
    [error, setError] = useState("");
  return (
    <div className={styles.codeTool}>
      <div className={styles.comparison}>
        <img src={revision.before} alt="修改前" />
        <img
          src={revision.after}
          alt="修改后"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        <span>Before · 原图</span>
        <span>After · 修改图</span>
      </div>
      <input
        className={styles.range}
        aria-label="原图与修改图比较"
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
      />
      <div className={styles.toolbar}>
        {onEdit && <button onClick={onEdit}>继续微调</button>}
        <button
          onClick={async () => {
            try {
              await saveFile(
                await (await fetch(revision.after)).blob(),
                "image-revision.png",
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          下载高清修改图
        </button>
        <small>{revision.model}</small>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
