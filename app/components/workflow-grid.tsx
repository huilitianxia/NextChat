"use client";
import { useEffect, useId, useRef, useState } from "react";
import { MAJOR_LABELS, Major } from "../config/user-profiles";
import { WORKFLOWS } from "../config/workflow-templates";
import { currentIdentity } from "../utils/identity-storage";
import styles from "./campus.module.scss";
export function WorkflowGrid({
  major,
  onSelect,
}: {
  major?: Major;
  onSelect: (id: string, prompt: string, image?: string) => void;
}) {
  const [filter, setFilter] = useState<Major | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const [imageError, setImageError] = useState("");
  const imagePicker = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const gridId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const matching = WORKFLOWS.filter(
    (flow) => filter === "all" || flow.major === filter,
  );
  if (filter === "all")
    matching.sort(
      (a, b) => Number(b.major === major) - Number(a.major === major),
    );
  const visible =
    filter === "all" && !expanded ? matching.slice(0, 6) : matching;
  return (
    <section aria-label="工作流模板">
      <input
        ref={imagePicker}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="选择建筑精修图片"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setImageError("");
          if (
            !file.size ||
            file.size > 10 * 1024 * 1024 ||
            !["image/png", "image/jpeg", "image/webp"].includes(file.type)
          ) {
            setImageError("请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片。");
            return;
          }
          const owner = currentIdentity();
          try {
            const image = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () =>
                reject(new Error("图片读取失败，请重新选择。"));
              reader.readAsDataURL(file);
            });
            if (mounted.current && owner === currentIdentity()) {
              const flow = WORKFLOWS.find((item) => item.id === "arch-edit")!;
              onSelect(flow.id, flow.prompt, image);
            }
          } catch {
            if (mounted.current && owner === currentIdentity())
              setImageError("图片读取失败，请重新选择。");
          }
        }}
      />
      <div className={styles.filters} role="group" aria-label="模板专业筛选">
        {[["all", "全部模板"], ...Object.entries(MAJOR_LABELS)].map(
          ([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id as Major | "all");
                setExpanded(false);
              }}
            >
              {label}
            </button>
          ),
        )}
      </div>
      <div className={styles.workflows} id={gridId}>
        {visible.map((flow) => (
          <button
            key={flow.id}
            type="button"
            onClick={() => {
              if (flow.id === "arch-edit") imagePicker.current?.click();
              else onSelect(flow.id, flow.prompt);
            }}
          >
            <strong>{flow.title}</strong>
            <small>{flow.description}</small>
            {flow.major === major && <em>本专业推荐</em>}
          </button>
        ))}
      </div>
      {filter === "all" && matching.length > 6 && (
        <button
          type="button"
          className={styles.workflowToggle}
          aria-expanded={expanded}
          aria-controls={gridId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起模板" : `展开全部 ${matching.length} 个模板`}
          <span aria-hidden="true">{expanded ? " ↑" : " ↓"}</span>
        </button>
      )}
      {imageError && (
        <p role="alert" className={styles.error}>
          {imageError}
        </p>
      )}
    </section>
  );
}
