"use client";
import { useEffect, useMemo, useState } from "react";
import {
  algorithmNumbers,
  AlgorithmFrame,
  bstSteps,
  dijkstraGrid,
  quickSortSteps,
} from "../utils/algorithm-steps";
import { cipherWaterfall, identifyHash } from "../utils/classical-ciphers";
import {
  ARCH_REFERENCES,
  stairDimensions,
  rampDimensions,
  parkingDimensions,
  daylightSpacing,
} from "../utils/architecture-reference";
import styles from "./capstone.module.scss";
function attempt<T>(fn: () => T) {
  try {
    return { value: fn(), error: "" };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}
function Tree({ frame }: { frame: AlgorithmFrame }) {
  const nodes = frame.nodes || [],
    positions = new Map<number, { x: number; y: number }>();
  let order = 0;
  function place(id: number | null, depth: number) {
    if (id === null) return;
    const node = nodes[id];
    place(node.left, depth + 1);
    positions.set(id, { x: ++order * 48, y: 30 + depth * 65 });
    place(node.right, depth + 1);
  }
  place(frame.root ?? null, 0);
  const h = Math.max(150, ...[...positions.values()].map((p) => p.y + 35)),
    w = Math.max(300, (nodes.length + 1) * 48);
  return (
    <div className={styles.scroll}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ minWidth: Math.min(w, 1200), width: "100%", height: h }}
        aria-label="二叉搜索树"
      >
        {nodes.flatMap((n) =>
          [n.left, n.right]
            .filter((id): id is number => id !== null)
            .map((id) => (
              <line
                key={`${n.id}-${id}`}
                x1={positions.get(n.id)!.x}
                y1={positions.get(n.id)!.y}
                x2={positions.get(id)!.x}
                y2={positions.get(id)!.y}
                stroke="currentColor"
              />
            )),
        )}
        {nodes.map((n) => {
          const p = positions.get(n.id)!;
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={21}
                fill={frame.active.includes(n.id) ? "#f8cc69" : "#d9e8df"}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize={10}
                fill="#19352a"
              >
                {n.value}
                {n.count > 1 ? `×${n.count}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
export function AlgorithmVisualizer() {
  const [algorithm, setAlgorithm] = useState("quick"),
    [input, setInput] = useState("8,3,10,1,6,14,4,7,13"),
    [order, setOrder] = useState<"in" | "pre" | "post">("in"),
    [walls, setWalls] = useState<number[]>([11, 19, 27, 35]),
    [weights, setWeights] = useState<Record<number, number>>({}),
    [paint, setPaint] = useState("wall"),
    [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(600);
  const result = useMemo(
      () =>
        attempt(() =>
          algorithm === "grid"
            ? dijkstraGrid(8, 6, walls, weights)
            : algorithm === "bst"
            ? bstSteps(algorithmNumbers(input), order)
            : quickSortSteps(algorithmNumbers(input)),
        ),
      [algorithm, input, order, walls, weights],
    ),
    frames = result.value || [],
    frame = frames[Math.min(index, frames.length - 1)];
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [result]);
  useEffect(() => {
    if (!playing) return;
    if (index >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), speed);
    return () => clearTimeout(timer);
  }, [playing, index, frames.length, speed]);
  return (
    <div className={styles.panel}>
      <div className={styles.grid}>
        <label>
          演示算法
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
          >
            <option value="quick">QuickSort 快速排序</option>
            <option value="bst">二叉搜索树插入与遍历</option>
            <option value="grid">Dijkstra 网格最短路径</option>
          </select>
        </label>
        {algorithm !== "grid" ? (
          <label>
            数据序列
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={400}
            />
          </label>
        ) : (
          <label>
            网格点击操作
            <select value={paint} onChange={(e) => setPaint(e.target.value)}>
              <option value="wall">切换障碍</option>
              <option value="weight">切换地形代价 1 / 5</option>
            </select>
          </label>
        )}
        {algorithm === "bst" && (
          <label>
            遍历顺序
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as typeof order)}
            >
              <option value="in">中序</option>
              <option value="pre">前序</option>
              <option value="post">后序</option>
            </select>
          </label>
        )}
      </div>
      <div className={styles.row}>
        <button disabled={!frame} onClick={() => setPlaying((p) => !p)}>
          {playing ? "暂停演示" : "播放演示"}
        </button>
        <button
          disabled={index === 0}
          onClick={() => {
            setPlaying(false);
            setIndex((i) => i - 1);
          }}
        >
          上一步
        </button>
        <button
          disabled={index >= frames.length - 1}
          onClick={() => {
            setPlaying(false);
            setIndex((i) => i + 1);
          }}
        >
          下一步
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
        >
          重置步骤
        </button>
        <label className={styles.inline}>
          步速
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            <option value={1000}>慢</option>
            <option value={600}>中</option>
            <option value={200}>快</option>
          </select>
        </label>
        <span>
          {frames.length ? Math.min(index + 1, frames.length) : 0}/
          {frames.length}
        </span>
      </div>
      {frame && (
        <>
          <p role="status">{frame.caption}</p>
          {algorithm === "grid" ? (
            <>
              <div className={styles.board}>
                {Array.from({ length: 48 }, (_, i) => (
                  <button
                    key={i}
                    aria-label={`网格 ${i}${walls.includes(i) ? " 障碍" : ""}`}
                    className={
                      walls.includes(i)
                        ? styles.wall
                        : frame.path?.includes(i)
                        ? styles.path
                        : frame.active.includes(i)
                        ? styles.active
                        : frame.visited?.includes(i)
                        ? styles.visited
                        : ""
                    }
                    disabled={i === 0 || i === 47}
                    onClick={() => {
                      if (paint === "wall")
                        setWalls((w) =>
                          w.includes(i) ? w.filter((n) => n !== i) : [...w, i],
                        );
                      else
                        setWeights((w) => ({ ...w, [i]: w[i] === 5 ? 1 : 5 }));
                    }}
                  >
                    {i === 0
                      ? "起"
                      : i === 47
                      ? "终"
                      : walls.includes(i)
                      ? "■"
                      : weights[i] === 5
                      ? "5×"
                      : frame.distances?.[i] ?? "·"}
                  </button>
                ))}
              </div>
              <small>
                四向移动，进入格子的代价默认
                1；绿色为最短路径，蓝色为已确定距离。点击网格可设置障碍 / 代价。
              </small>
            </>
          ) : algorithm === "bst" ? (
            <>
              <Tree frame={frame} />
              <p>遍历结果：{frame.output?.join(" → ") || "等待遍历"}</p>
            </>
          ) : (
            <svg
              className={styles.plot}
              viewBox="0 0 620 220"
              aria-label="快速排序步骤"
            >
              {frame.values?.map((v, i) => {
                const width = 580 / frame.values!.length,
                  height =
                    25 +
                    (Math.abs(v) /
                      Math.max(1, ...frame.values!.map(Math.abs))) *
                      130;
                return (
                  <g key={i}>
                    <rect
                      x={20 + i * width}
                      y={180 - height}
                      width={width - 3}
                      height={height}
                      fill={
                        frame.pivot === i
                          ? "#cf7d52"
                          : frame.active.includes(i)
                          ? "#f8cc69"
                          : "#79a397"
                      }
                    />
                    <text
                      x={20 + (i + 0.5) * width}
                      y={200}
                      textAnchor="middle"
                      fontSize={12}
                      fill="currentColor"
                    >
                      {v}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </>
      )}
      {result.error && (
        <p role="alert" className={styles.error}>
          {result.error}
        </p>
      )}
    </div>
  );
}
export function CipherWaterfall() {
  const [input, setInput] = useState("SGVsbG8="),
    result = useMemo(() => attempt(() => cipherWaterfall(input)), [input]);
  return (
    <div className={styles.panel}>
      <label>
        待识别字符串
        <textarea
          rows={4}
          maxLength={8000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      <p>{identifyHash(input).join("；") || "未匹配常见摘要 / JWT 结构"}</p>
      <small>
        格式识别不等于验证。摘要不能反解；JWT
        解码不会验证签名。所有结果仅在本机计算。
      </small>
      {result.error && <p className={styles.error}>{result.error}</p>}
      <div className={styles.grid}>
        {result.value?.map((r) => (
          <section key={r.name} className={styles.note}>
            <strong>{r.name}</strong>
            <pre>{r.text || "（空结果）"}</pre>
            {r.hex && <small>HEX {r.hex}</small>}
          </section>
        ))}
      </div>
    </div>
  );
}
function NumberInput({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: (n: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="any"
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) =>
          change(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
export function ArchitectureReference() {
  const [kind, setKind] = useState<keyof typeof ARCH_REFERENCES>("stair"),
    [a, setA] = useState(3000),
    [b, setB] = useState(175),
    [c, setC] = useState(260),
    [accessible, setAccessible] = useState(false),
    [mode, setMode] = useState<"angle" | "coefficient">("angle");
  const ref = ARCH_REFERENCES[kind],
    result = attempt(() => {
      if (kind === "stair") {
        const v = stairDimensions(a, b, c);
        return `踏步级数 ${v.risers}；实际级高 ${v.actualRiser.toFixed(
          2,
        )} mm；2R+T = ${v.walkingSum.toFixed(
          2,
        )} mm（人体工学比较值）；坡角 ${v.angle.toFixed(
          2,
        )}°\n住宅公共楼梯两项尺寸检查：级高${
          v.riserWithinLimit ? "符合 ≤175 mm" : "超过限值"
        }，踏面${v.treadWithinLimit ? "符合 ≥260 mm" : "低于限值"}。`;
      }
      if (kind === "ramp") {
        const v = rampDimensions(a, b);
        return `水平总长 ${
          v.runMm / 1000
        } m（不含平台）；坡度 ${v.gradePercent.toFixed(2)}%；至少 ${
          v.flightCount
        } 段。\n${
          v.standardSlope
            ? "纵坡满足一般不陡于 1:12 的条件"
            : "纵坡超过一般 1:12 限值"
        }；需另核对平台、净宽、扶手等条件。`;
      }
      if (kind === "parking") {
        const v = parkingDimensions(a, b, c, accessible);
        return `每位占用 ${v.width.toFixed(2)} × ${v.length.toFixed(
          2,
        )} m；净面积 ${v.netArea.toFixed(
          2,
        )} m²。\n不含车道、柱网、转弯和其他公共面积。`;
      }
      const v = daylightSpacing(a, b, mode);
      return `间距系数 ${v.coefficient.toFixed(
        4,
      )}；几何间距 ${v.spacing.toFixed(
        2,
      )} m。\n教学公式 D = H × 系数；角度模式系数 = cot(太阳高度角)。不等同于项目日照达标结论。`;
    });
  return (
    <div className={styles.panel}>
      <label>
        中国大陆规范＋教学计算
        <select
          value={kind}
          onChange={(e) => {
            const key = e.target.value as typeof kind;
            setKind(key);
            const values = {
              stair: [3000, 175, 260],
              ramp: [600, 12, 0],
              parking: [1, 2.4, 5.3],
              daylight: [24, 30, 0],
            }[key];
            setA(values[0]);
            setB(values[1]);
            setC(values[2]);
            setMode("angle");
          }}
        >
          <option value="stair">住宅楼梯与人体工学</option>
          <option value="ramp">无障碍坡道</option>
          <option value="parking">停车位尺寸</option>
          <option value="daylight">日照间距系数</option>
        </select>
      </label>
      <a href={ref.url} target="_blank" rel="noreferrer">
        {ref.title}
      </a>
      <p>{ref.detail}</p>
      {kind === "daylight" && (
        <label>
          计算方式
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setB(e.target.value === "angle" ? 30 : 1.5);
            }}
          >
            <option value="angle">太阳高度角</option>
            <option value="coefficient">自定义地方 / 题目系数</option>
          </select>
        </label>
      )}
      <div className={styles.grid}>
        <NumberInput
          label={
            {
              stair: "层高 mm",
              ramp: "总提升高度 mm",
              parking: "车位数量",
              daylight: "遮挡高度差 m",
            }[kind]
          }
          value={a}
          change={setA}
        />
        <NumberInput
          label={
            {
              stair: "目标级高 mm",
              ramp: "纵坡 1 : n",
              parking: "车位宽 m",
              daylight: mode === "angle" ? "太阳高度角 °" : "间距系数",
            }[kind]
          }
          value={b}
          change={setB}
        />
        {(kind === "stair" || kind === "parking") && (
          <NumberInput
            label={kind === "stair" ? "踏面宽 mm" : "车位长 m"}
            value={c}
            change={setC}
          />
        )}
      </div>
      {kind === "parking" && (
        <label className={styles.inline}>
          <input
            type="checkbox"
            checked={accessible}
            onChange={(e) => setAccessible(e.target.checked)}
          />
          每位附加 1.20 m 轮椅通道
        </label>
      )}
      {result.value && <pre>{result.value}</pre>}
      {result.error && (
        <p role="alert" className={styles.error}>
          {result.error}
        </p>
      )}
    </div>
  );
}
