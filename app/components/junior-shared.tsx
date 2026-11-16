"use client";
import { useState, ReactNode } from "react";
import { useCampusUI } from "../store/campus";
import type { Point } from "../utils/junior-common";
import styles from "./finale.module.scss";
import junior from "./junior.module.scss";
export { styles, junior };
export const num = (n: number | null | undefined, digits = 10) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : Number(n.toPrecision(digits)).toLocaleString("en-US", {
        maximumSignificantDigits: digits,
        useGrouping: false,
      });
export function calculate<T>(fn: () => T): { value: T | null; error: string } {
  try {
    return { value: fn(), error: "" };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}
export function NumberFields<T extends Record<string, number>>({
  value,
  set,
  fields,
}: {
  value: T;
  set: (value: T) => void;
  fields: [keyof T, string][];
}) {
  return (
    <div className={styles.grid}>
      {fields.map(([key, label]) => (
        <label key={String(key)}>
          {label}
          <input
            type="number"
            step="any"
            value={Number.isNaN(value[key]) ? "" : value[key]}
            onChange={(e) =>
              set({
                ...value,
                [key]: e.target.value === "" ? NaN : Number(e.target.value),
              })
            }
          />
        </label>
      ))}
    </div>
  );
}
export function TextField({
  label,
  value,
  set,
  max = 1000,
}: {
  label: string;
  value: string;
  set: (s: string) => void;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        maxLength={max}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}
export function Select({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (s: any) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Section({
  title,
  children,
  preset,
}: {
  title: string;
  children: ReactNode;
  preset?: () => void;
}) {
  return (
    <section className={junior.section}>
      <div className={junior.editorHead}>
        <h3>{title}</h3>
        {preset && <button onClick={preset}>载入例题</button>}
      </div>
      {children}
    </section>
  );
}
export function Result({ text, error }: { text?: string; error?: string }) {
  return error ? (
    <p className={styles.error} role="alert">
      {error}
    </p>
  ) : (
    <output className={junior.summary}>{text}</output>
  );
}
export function Reference({ title, text }: { title: string; text: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className={styles.toolbar}>
      <button
        onClick={() => {
          useCampusUI.getState().dispatch({
            kind: "append",
            text: `\n\n【${title} · 本地计算】\n${text}\n`,
          });
          setSent(true);
        }}
      >
        引用精确计算结果到对话
      </button>
      {sent && (
        <small role="status">已插入输入框，关闭工具后可继续编辑。</small>
      )}
    </div>
  );
}
export function Note({ children }: { children: ReactNode }) {
  return <p className={junior.note}>{children}</p>;
}
export function Plot({
  title,
  points,
  xLabel,
  yLabel,
  band,
  markerX,
  yRange,
  xFormat = num,
}: {
  title: string;
  points: Point[];
  xLabel: string;
  yLabel: string;
  band?: [number, number];
  markerX?: number;
  yRange?: [number, number];
  xFormat?: (n: number) => string;
}) {
  const [cursor, setCursor] = useState(0);
  const valid = points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (valid.length < 2) return <p>暂无有效曲线。</p>;
  const minX = Math.min(...valid.map((p) => p.x)),
    maxX = Math.max(...valid.map((p) => p.x)),
    ys = valid.map((p) => p.y),
    minY = yRange?.[0] ?? Math.min(0, ...ys),
    maxY = yRange?.[1] ?? Math.max(...ys),
    spanX = maxX - minX || 1,
    spanY = maxY - minY || 1,
    x = (v: number) => 58 + ((v - minX) / spanX) * 500,
    y = (v: number) => 200 - ((v - minY) / spanY) * 160,
    index = Math.min(cursor, valid.length - 1),
    selected = valid[index];
  return (
    <div>
      <svg
        className={junior.plot}
        viewBox="0 0 600 248"
        role="img"
        aria-label={title}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect(),
            value =
              minX +
              ((((event.clientX - bounds.left) / bounds.width) * 600 - 58) /
                500) *
                spanX;
          let nearest = 0;
          valid.forEach((p, i) => {
            if (Math.abs(p.x - value) < Math.abs(valid[nearest].x - value))
              nearest = i;
          });
          setCursor(nearest);
        }}
      >
        <title>{title}</title>
        {band && (
          <rect
            x={x(band[0])}
            y="40"
            width={Math.max(0, x(band[1]) - x(band[0]))}
            height="160"
            fill="#4cba91"
            opacity=".13"
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1="58"
              x2="558"
              y1={40 + 160 * f}
              y2={40 + 160 * f}
              stroke="currentColor"
              opacity=".12"
            />
            <text
              x="52"
              y={44 + 160 * f}
              fontSize="10"
              textAnchor="end"
              fill="currentColor"
            >
              {num(maxY - f * spanY, 4)}
            </text>
          </g>
        ))}
        <path
          d="M58 40V200H558"
          fill="none"
          stroke="currentColor"
          opacity=".5"
        />
        <polyline
          points={valid.map((p) => `${x(p.x)},${y(p.y)}`).join(" ")}
          stroke="var(--primary)"
          fill="none"
          strokeWidth="2.4"
        />
        {markerX !== undefined && (
          <line
            x1={x(markerX)}
            x2={x(markerX)}
            y1="40"
            y2="200"
            stroke="#dc8455"
            strokeDasharray="5 3"
          />
        )}
        <circle cx={x(selected.x)} cy={y(selected.y)} r="4" fill="#dc8455" />
        <text x="18" y="22" fontSize="11" fill="currentColor">
          {yLabel}
        </text>
        <text x="58" y="220" fontSize="11" fill="currentColor">
          {xFormat(minX)}
        </text>
        <text
          x="308"
          y="220"
          textAnchor="middle"
          fontSize="11"
          fill="currentColor"
        >
          {xFormat((minX + maxX) / 2)}
        </text>
        <text
          x="558"
          y="220"
          textAnchor="end"
          fontSize="11"
          fill="currentColor"
        >
          {xFormat(maxX)}
        </text>
        <text
          x="308"
          y="240"
          textAnchor="middle"
          fontSize="11"
          fill="currentColor"
        >
          {xLabel}
        </text>
      </svg>
      <label className={junior.note}>
        {title} 游标：{xFormat(selected.x)} / {num(selected.y, 7)}
        <input
          aria-label={`${title} 游标`}
          type="range"
          min="0"
          max={valid.length - 1}
          value={index}
          onChange={(e) => setCursor(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
