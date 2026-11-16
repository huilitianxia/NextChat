"use client";
import { useEffect, useMemo, useState } from "react";
import { CampusDialog } from "./campus-dialog";
import {
  DataPoint,
  FitModel,
  FitResult,
  LabData,
  evaluateFit,
  fitCurve,
  fitReport,
  inspectLabFile,
  pointsFromRows,
  precision,
} from "../utils/curve-fitter";
import { useCampusUI } from "../store/campus";
import styles from "./capstone.module.scss";
const MODELS: Record<FitModel, string> = {
  linear: "线性",
  poly2: "二次多项式",
  poly3: "三次多项式",
  poly4: "四次多项式",
  exponential: "指数",
  logarithmic: "对数",
  power: "幂律",
};
function Plot({
  points,
  fit,
  excluded,
  toggle,
}: {
  points: DataPoint[];
  fit: FitResult | null;
  excluded: number[];
  toggle: (row: number) => void;
}) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    dx = maxX - minX || 1;
  const curve = fit
    ? Array.from({ length: 161 }, (_, i) => {
        const x = minX + (dx * i) / 160;
        return { x, y: evaluateFit(fit, x) };
      }).filter((p) => Number.isFinite(p.y))
    : [];
  const lo = Math.min(...ys, ...curve.map((p) => p.y)),
    hi = Math.max(...ys, ...curve.map((p) => p.y)),
    dy = hi - lo || 1;
  const px = (x: number) => 55 + ((x - minX) / dx) * 520,
    py = (y: number) => 265 - ((y - lo) / dy) * 235;
  return (
    <svg
      className={styles.plot}
      viewBox="0 0 620 310"
      role="img"
      aria-label="散点与拟合曲线，点击数据点切换排除"
    >
      <path d="M55 20 V265 H590" stroke="currentColor" fill="none" />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <text
            x={55 + t * 520}
            y={286}
            textAnchor="middle"
            fontSize="10"
            fill="currentColor"
          >
            {(minX + t * dx).toPrecision(4)}
          </text>
          <text
            x={48}
            y={269 - t * 235}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
          >
            {(lo + t * dy).toPrecision(4)}
          </text>
        </g>
      ))}
      <text x={600} y={286} fontSize="12" fill="currentColor">
        X
      </text>
      <text x={20} y={15} fontSize="12" fill="currentColor">
        Y
      </text>
      {curve.length > 1 && (
        <path
          d={curve
            .map((p, i) => `${i ? "L" : "M"}${px(p.x)},${py(p.y)}`)
            .join(" ")}
          fill="none"
          stroke="#2078b4"
          strokeWidth="2"
        />
      )}
      {points.map((p) => (
        <circle
          key={p.row}
          cx={px(p.x)}
          cy={py(p.y)}
          r={4}
          fill={excluded.includes(p.row) ? "#b7b7b7" : "#c56734"}
          tabIndex={0}
          role="button"
          aria-label={`数据行 ${p.row}，${
            excluded.includes(p.row) ? "已排除" : "已启用"
          }`}
          onClick={() => toggle(p.row)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle(p.row);
            }
          }}
        >
          <title>{`第 ${p.row} 行 · X=${p.x}, Y=${p.y}`}</title>
        </circle>
      ))}
    </svg>
  );
}
export default function CurveFitter({
  file,
  onClose,
}: {
  file: File;
  onClose: () => void;
}) {
  const [data, setData] = useState<LabData | null>(null),
    [error, setError] = useState(""),
    [sheet, setSheet] = useState(0),
    [x, setX] = useState(0),
    [y, setY] = useState(1),
    [header, setHeader] = useState(true),
    [model, setModel] = useState<FitModel>("linear"),
    [excluded, setExcluded] = useState<number[]>([]),
    [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    inspectLabFile(file)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [file]);
  const rows = useMemo(() => data?.sheets[sheet]?.rows || [], [data, sheet]),
    parsed = useMemo(
      () => pointsFromRows(rows, x, y, header),
      [rows, x, y, header],
    ),
    active = useMemo(
      () => parsed.points.filter((p) => !excluded.includes(p.row)),
      [parsed, excluded],
    );
  const result = useMemo(() => {
    try {
      return { fit: fitCurve(active, model), error: "" };
    } catch (e) {
      return { fit: null, error: (e as Error).message };
    }
  }, [active, model]);
  const columns = Math.max(0, ...rows.map((r) => r.length)),
    toggle = (row: number) =>
      setExcluded((prev) =>
        prev.includes(row) ? prev.filter((r) => r !== row) : [...prev, row],
      );
  const change = () => {
    setExcluded([]);
    setPage(0);
  };
  return (
    <CampusDialog title="实验数据拟合台" onClose={onClose}>
      <div className={styles.panel}>
        <p>{file.name} · 全部计算在本机完成</p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {!data && !error && <p role="status">正在读取数据…</p>}
        {data && (
          <>
            <div className={styles.grid}>
              <label>
                工作表
                <select
                  value={sheet}
                  onChange={(e) => {
                    setSheet(Number(e.target.value));
                    setX(0);
                    setY(1);
                    change();
                  }}
                >
                  {data.sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                拟合模型
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as FitModel)}
                >
                  {Object.entries(MODELS).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {(["X", "Y"] as const).map((axis) => (
                <label key={axis}>
                  {axis} 列
                  <select
                    value={axis === "X" ? x : y}
                    onChange={(e) => {
                      (axis === "X" ? setX : setY)(Number(e.target.value));
                      change();
                    }}
                  >
                    {Array.from({ length: columns }, (_, i) => (
                      <option value={i} key={i}>
                        {i + 1}
                        {header ? ` · ${rows[0]?.[i] ?? "空标题"}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label className={styles.inline}>
              <input
                type="checkbox"
                checked={header}
                onChange={(e) => {
                  setHeader(e.target.checked);
                  change();
                }}
              />
              首行为表头
            </label>
            <small>
              有效数值 {parsed.points.length} 行；空白 / 非数值{" "}
              {parsed.invalid.length} 行；手动排除 {excluded.length} 行。SD
              为样本标准差；RSD = SD / |均值|。
              {data.sheets[sheet].formulas > 0
                ? " 工作表含公式，读取的是已保存的缓存值，不会重新计算公式。"
                : ""}
            </small>
            <Plot
              points={parsed.points}
              fit={result.fit}
              excluded={excluded}
              toggle={toggle}
            />
            {result.fit ? (
              <>
                <div className={styles.stats}>
                  {["xStats", "yStats"].map((key, i) => {
                    const s = result.fit![key as "xStats" | "yStats"];
                    return (
                      <span key={key}>
                        {i ? "Y" : "X"}：均值 {precision(s.mean)} · SD{" "}
                        {s.sd === null ? "—" : precision(s.sd)} · RSD{" "}
                        {s.rsd === null ? "—" : precision(s.rsd) + "%"}
                      </span>
                    );
                  })}
                </div>
                <pre>
                  {result.fit.equation}
                  {"\n"}R² ={" "}
                  {result.fit.r2 === null
                    ? "未定义（Y 无变异）"
                    : precision(result.fit.r2)}
                  {"\n"}
                  {result.fit.objective}
                </pre>
                <button
                  onClick={() => {
                    useCampusUI.getState().dispatch({
                      kind: "draft",
                      text: fitReport(
                        result.fit!,
                        `${file.name} / ${data.sheets[sheet].name}`,
                        excluded,
                      ),
                    });
                    onClose();
                  }}
                >
                  插入精确拟合结果到对话
                </button>
              </>
            ) : (
              <p role="alert" className={styles.error}>
                {result.error}
              </p>
            )}
            <div className={styles.row}>
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                上一组数据
              </button>
              <span>
                {page * 100 + 1}–{Math.min(rows.length, (page + 1) * 100)} /{" "}
                {rows.length} 行
              </span>
              <button
                disabled={(page + 1) * 100 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                下一组数据
              </button>
              <button onClick={() => setExcluded([])}>恢复全部数据点</button>
            </div>
            <div className={styles.scroll}>
              <table>
                <thead>
                  <tr>
                    <th>启用</th>
                    <th>行号</th>
                    {Array.from({ length: columns }, (_, i) => (
                      <th key={i}>列 {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 100, (page + 1) * 100).map((row, i) => {
                    const line = page * 100 + i + 1,
                      valid = parsed.points.some((p) => p.row === line);
                    return (
                      <tr key={line} data-excluded={excluded.includes(line)}>
                        <td>
                          {valid ? (
                            <input
                              type="checkbox"
                              aria-label={`启用第 ${line} 行`}
                              checked={!excluded.includes(line)}
                              onChange={() => toggle(line)}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{line}</td>
                        {Array.from({ length: columns }, (_, c) => (
                          <td key={c} title={String(row[c] ?? "")}>
                            {String(row[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </CampusDialog>
  );
}
