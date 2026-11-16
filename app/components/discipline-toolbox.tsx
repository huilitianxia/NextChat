"use client";
import { useEffect, useMemo, useState } from "react";
import {
  solarShadow,
  landRatios,
  decodeResistor,
  RESISTOR_COLORS,
  RESISTOR_TOLERANCE,
  rcFilter,
  seriesRLC,
  bodeMagnitude,
  opAmpGain,
  molarity,
  dilution,
  stoichiometry,
  parseBits,
  flipBit,
  cidrSubnet,
} from "../utils/stem-calculators";
import { regexMatchesAsync, RegexMatch } from "../utils/regex-helper";
import elements from "../config/periodic-elements.json";
import { CampusDialog } from "./campus-dialog";
import styles from "./finale.module.scss";
import {
  AlgorithmVisualizer,
  CipherWaterfall,
  ArchitectureReference,
} from "./toolbox-vol2";
import JuniorMedical from "./junior-medical";
import JuniorChemistry from "./junior-chemistry";
import JuniorElectrical from "./junior-electrical";
import JuniorArchitecture from "./junior-architecture";
import JuniorSystems from "./junior-systems";
import JuniorCrypto from "./junior-crypto";
function Field({
  label,
  value,
  onChange,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        step={step}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
function calc<T>(run: () => T): { value: T | null; error: string } {
  try {
    return { value: run(), error: "" };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}
const number = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("zh-CN", { maximumSignificantDigits: 7 })
    : "—";
function Architecture() {
  const [latitude, setLatitude] = useState(31.23),
    [height, setHeight] = useState(24),
    [season, setSeason] = useState<"june" | "december" | "equinox">("equinox"),
    [hour, setHour] = useState(12),
    [site, setSite] = useState(10000),
    [floor, setFloor] = useState(25000),
    [green, setGreen] = useState(3500);
  const sun = calc(() => solarShadow(latitude, height, season, hour)),
    ratios = calc(() => landRatios(site, floor, green)),
    shadow =
      height > 0 && sun.value?.shadow !== null
        ? Math.min(360, ((sun.value?.shadow || 0) / height) * 100)
        : 0;
  return (
    <>
      <section className={styles.card}>
        <h3>太阳高度与建筑阴影</h3>
        <div className={styles.grid}>
          <Field
            label="纬度 °（北正南负）"
            value={latitude}
            onChange={setLatitude}
          />
          <Field label="建筑高度 m" value={height} onChange={setHeight} />
          <label>
            节气
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value as any)}
            >
              <option value="june">六月至日</option>
              <option value="equinox">春分 / 秋分</option>
              <option value="december">十二月至日</option>
            </select>
          </label>
          <Field label="当地真太阳时 h" value={hour} onChange={setHour} />
        </div>
        {sun.value ? (
          <>
            <svg
              className={styles.plot}
              viewBox="0 0 600 225"
              role="img"
              aria-label="建筑阴影示意图"
            >
              <line x1="20" y1="190" x2="580" y2="190" stroke="currentColor" />
              <rect
                x="145"
                y="90"
                width="40"
                height="100"
                fill="currentColor"
                opacity=".6"
              />
              {sun.value.daylight ? (
                <>
                  <circle cx="80" cy="40" r="18" fill="#ecb844" />
                  <line
                    x1="185"
                    y1="90"
                    x2={185 + shadow}
                    y2="190"
                    stroke="#ecb844"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                  <rect
                    x="185"
                    y="185"
                    width={shadow}
                    height="5"
                    fill="currentColor"
                    opacity=".3"
                  />
                </>
              ) : (
                <text x="260" y="100" fill="currentColor">
                  太阳位于地平线以下
                </text>
              )}
              <text x="125" y="214" fill="currentColor">
                {height} m
              </text>
              <text x="240" y="214" fill="currentColor">
                {sun.value.shadow === null
                  ? "无直射阴影"
                  : "阴影 " + number(sun.value.shadow) + " m"}
              </text>
            </svg>
            <output>
              太阳高度 {number(sun.value.altitude)}° · 赤纬{" "}
              {sun.value.declination}°
            </output>
          </>
        ) : (
          <p className={styles.error}>{sun.error}</p>
        )}
        <p className={styles.muted}>
          理想水平地面、垂直建筑；太阳时不等于时区钟表时间。长阴影示意会缩短，不计地形、折射和周边遮挡。
        </p>
      </section>
      <section className={styles.card}>
        <h3>用地指标</h3>
        <div className={styles.three}>
          <Field label="总用地面积 m²" value={site} onChange={setSite} />
          <Field label="计容建筑面积 m²" value={floor} onChange={setFloor} />
          <Field label="绿地面积 m²" value={green} onChange={setGreen} />
        </div>
        {ratios.value ? (
          <p className={styles.output}>
            容积率 {number(ratios.value.far)} · 绿地率{" "}
            {number(ratios.value.greenPercent)}%
          </p>
        ) : (
          <p className={styles.error}>{ratios.error}</p>
        )}
      </section>
    </>
  );
}
const COLOR_NAMES: Record<string, string> = {
  black: "黑",
  brown: "棕",
  red: "红",
  orange: "橙",
  yellow: "黄",
  green: "绿",
  blue: "蓝",
  violet: "紫",
  gray: "灰",
  white: "白",
  gold: "金",
  silver: "银",
  none: "无",
};
function Electrical() {
  const [bands, setBands] = useState(["brown", "black", "red", "gold"]),
    [resistance, setResistance] = useState(1000),
    [capacitance, setCapacitance] = useState(100),
    [inductance, setInductance] = useState(10),
    [mode, setMode] = useState("rc"),
    [rin, setRin] = useState(1000),
    [rf, setRf] = useState(10000),
    [op, setOp] = useState<"inverting" | "noninverting">("inverting");
  const decoded = calc(() => decodeResistor(bands)),
    rc = calc(() => rcFilter(resistance, capacitance * 1e-9)),
    rlc = calc(() =>
      seriesRLC(resistance, inductance * 1e-3, capacitance * 1e-9),
    ),
    gain = calc(() => opAmpGain(op, rin, rf));
  const center = mode === "rc" ? rc.value?.cutoff : rlc.value?.center,
    points = center
      ? Array.from({ length: 101 }, (_, i) => {
          const f = center * 10 ** ((i / 100) * 6 - 3),
            db = bodeMagnitude(
              f,
              resistance,
              capacitance * 1e-9,
              mode === "rlc" ? inductance * 1e-3 : undefined,
            );
          return `${35 + i * 5.2},${20 + Math.min(80, -db) * 2}`;
        }).join(" ")
      : "";
  return (
    <>
      <section className={styles.card}>
        <h3>电阻色环解码</h3>
        <div className={styles.toolbar}>
          <button
            aria-pressed={bands.length === 4}
            onClick={() => setBands(["brown", "black", "red", "gold"])}
          >
            四环
          </button>
          <button
            aria-pressed={bands.length === 5}
            onClick={() =>
              setBands(["brown", "black", "black", "red", "brown"])
            }
          >
            五环
          </button>
        </div>
        <div className={styles.toolbar}>
          {bands.map((band, i) => {
            const choices =
              i === bands.length - 1
                ? Object.keys(RESISTOR_TOLERANCE)
                : i === bands.length - 2
                ? [...RESISTOR_COLORS, "gold", "silver"]
                : RESISTOR_COLORS;
            return (
              <label key={`${bands.length}-${i}`}>
                {i === bands.length - 1
                  ? "容差"
                  : i === bands.length - 2
                  ? "倍率"
                  : `第 ${i + 1} 位`}
                <select
                  aria-label={`色环 ${i + 1}`}
                  value={band}
                  onChange={(e) =>
                    setBands((b) =>
                      b.map((v, j) => (i === j ? e.target.value : v)),
                    )
                  }
                >
                  {choices.map((color) => (
                    <option key={color} value={color}>
                      {COLOR_NAMES[color]}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        {decoded.value ? (
          <p className={styles.output}>
            {number(decoded.value.ohms)} Ω ±{decoded.value.tolerance}%<br />
            范围 {number(decoded.value.min)}–{number(decoded.value.max)} Ω
          </p>
        ) : (
          <p className={styles.error}>{decoded.error}</p>
        )}
      </section>
      <section className={styles.card}>
        <h3>RC / 串联 RLC</h3>
        <div className={styles.toolbar}>
          <button aria-pressed={mode === "rc"} onClick={() => setMode("rc")}>
            RC 低通 · 输出 C 两端
          </button>
          <button aria-pressed={mode === "rlc"} onClick={() => setMode("rlc")}>
            串联 RLC 带通 · 输出 R 两端
          </button>
        </div>
        <div className={styles.three}>
          <Field label="R / Ω" value={resistance} onChange={setResistance} />
          <Field label="C / nF" value={capacitance} onChange={setCapacitance} />
          {mode === "rlc" && (
            <Field label="L / mH" value={inductance} onChange={setInductance} />
          )}
        </div>
        {mode === "rc" && rc.value ? (
          <p className={styles.output}>
            −3 dB 截止 {number(rc.value.cutoff)} Hz · 时间常数{" "}
            {number(rc.value.tau * 1000)} ms
          </p>
        ) : mode === "rlc" && rlc.value ? (
          <p className={styles.output}>
            谐振 {number(rlc.value.center)} Hz · Q {number(rlc.value.q)}
            <br />
            −3 dB 下限 {number(rlc.value.low)} Hz / 上限{" "}
            {number(rlc.value.high)} Hz
            <br />
            带宽 {number(rlc.value.bandwidth)} Hz
          </p>
        ) : (
          <p className={styles.error}>{mode === "rc" ? rc.error : rlc.error}</p>
        )}
        {points && (
          <svg
            className={styles.plot}
            viewBox="0 0 590 220"
            role="img"
            aria-label="Bode 幅频示意图"
          >
            <path
              d="M35 20V180H555"
              stroke="currentColor"
              fill="none"
              opacity=".4"
            />
            {[0, 20, 40, 60, 80].map((db) => (
              <g key={db}>
                <line
                  x1="35"
                  y1={20 + db * 2}
                  x2="555"
                  y2={20 + db * 2}
                  stroke="currentColor"
                  opacity=".1"
                />
                <text x="1" y={24 + db * 2} fill="currentColor">
                  −{db}
                </text>
              </g>
            ))}
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <text x="35" y="204" fill="currentColor">
              {number(center! * 1e-3)} Hz
            </text>
            <text x="250" y="204" fill="currentColor">
              {number(center!)} Hz
            </text>
            <text x="470" y="204" fill="currentColor">
              {number(center! * 1e3)} Hz
            </text>
            <text x="4" y="12" fill="currentColor">
              dB
            </text>
          </svg>
        )}
        <small>理想元件；横轴为对数频率，幅值显示到 −80 dB。</small>
      </section>
      <section className={styles.card}>
        <h3>理想运放闭环增益</h3>
        <div className={styles.three}>
          <label>
            配置
            <select value={op} onChange={(e) => setOp(e.target.value as any)}>
              <option value="inverting">反相</option>
              <option value="noninverting">同相</option>
            </select>
          </label>
          <Field label="输入 / 接地电阻 Ω" value={rin} onChange={setRin} />
          <Field label="反馈电阻 Ω" value={rf} onChange={setRf} />
        </div>
        {gain.value !== null ? (
          <p className={styles.output}>电压增益 {number(gain.value)} V/V</p>
        ) : (
          <p className={styles.error}>{gain.error}</p>
        )}
      </section>
    </>
  );
}
function elementPosition(n: number) {
  if (n === 1) return [1, 1];
  if (n === 2) return [1, 18];
  if (n <= 10) return [2, n < 5 ? n - 2 : n + 8];
  if (n <= 18) return [3, n < 13 ? n - 10 : n];
  if (n <= 36) return [4, n - 18];
  if (n <= 54) return [5, n - 36];
  if (n <= 57) return [6, n - 54];
  if (n <= 71) return [8, n - 54];
  if (n <= 86) return [6, n - 68];
  if (n <= 89) return [7, n - 86];
  if (n <= 103) return [9, n - 86];
  return [7, n - 100];
}
function Chemistry() {
  const [atomic, setAtomic] = useState(6),
    [mass, setMass] = useState(5.844),
    [molarMass, setMolarMass] = useState(58.44),
    [volume, setVolume] = useState(1000),
    [c1, setC1] = useState(1),
    [c2, setC2] = useState(0.1),
    [final, setFinal] = useState(100),
    [moles, setMoles] = useState(1),
    [given, setGiven] = useState(2),
    [target, setTarget] = useState(1),
    [productMass, setProductMass] = useState(18.015);
  const element = elements[atomic - 1],
    concentration = calc(() => molarity(mass, molarMass, volume)),
    diluted = calc(() => dilution(c1, c2, final)),
    stoich = calc(() => stoichiometry(moles, given, target, productMass));
  return (
    <>
      <section className={styles.card}>
        <h3>元素周期表 · 118 元素</h3>
        <div className={styles.periodicScroll}>
          <div className={styles.periodic}>
            {elements.map((e) => {
              const [row, column] = elementPosition(e.number);
              return (
                <button
                  key={e.number}
                  style={{ gridRow: row, gridColumn: column }}
                  aria-label={`${e.number} ${e.symbol} ${e.name}`}
                  aria-pressed={atomic === e.number}
                  onClick={() => setAtomic(e.number)}
                >
                  <small>{e.number}</small>
                  {e.symbol}
                </button>
              );
            })}
          </div>
        </div>
        <p className={styles.output}>
          <strong>
            {element.number} · {element.symbol} · {element.name}
          </strong>
          <br />
          原子质量：{element.mass} u<br />
          电子排布：{element.configuration || "暂无数据"}
          <br />
          电负性（Pauling）：{element.electronegativity || "未定义 / 暂无数据"}
          <br />
          分类：{element.category}
        </p>
        <small>
          PubChem
          静态数据快照（2026-11-16）；缺失值不估算。放射性元素可能列出代表性同位素质量。
        </small>
      </section>
      <section className={styles.card}>
        <h3>质量 → 物质的量浓度</h3>
        <div className={styles.three}>
          <Field label="溶质质量 g" value={mass} onChange={setMass} />
          <Field
            label="摩尔质量 g/mol"
            value={molarMass}
            onChange={setMolarMass}
          />
          <Field label="溶液总体积 mL" value={volume} onChange={setVolume} />
        </div>
        {concentration.value ? (
          <p className={styles.output}>
            {number(concentration.value.moles)} mol ·{" "}
            {number(concentration.value.concentration)} mol/L
          </p>
        ) : (
          <p className={styles.error}>{concentration.error}</p>
        )}
      </section>
      <section className={styles.card}>
        <h3>稀释 · C₁V₁ = C₂V₂</h3>
        <div className={styles.three}>
          <Field label="原液浓度 mol/L" value={c1} onChange={setC1} />
          <Field label="目标浓度 mol/L" value={c2} onChange={setC2} />
          <Field label="定容体积 mL" value={final} onChange={setFinal} />
        </div>
        {diluted.value ? (
          <p className={styles.output}>
            取原液 {number(diluted.value.stockMl)} mL，加溶剂定容至{" "}
            {number(final)} mL。
            <br />
            <small>
              体积可加的近似下，需溶剂 {number(diluted.value.solventMl)} mL。
            </small>
          </p>
        ) : (
          <p className={styles.error}>{diluted.error}</p>
        )}
      </section>
      <section className={styles.card}>
        <h3>已配平反应的化学计量</h3>
        <div className={styles.grid}>
          <Field label="已知物质的量 mol" value={moles} onChange={setMoles} />
          <Field
            label="已知物的化学计量系数"
            value={given}
            onChange={setGiven}
          />
          <Field
            label="目标物的化学计量系数"
            value={target}
            onChange={setTarget}
          />
          <Field
            label="目标物摩尔质量 g/mol"
            value={productMass}
            onChange={setProductMass}
          />
        </div>
        {stoich.value ? (
          <p className={styles.output}>
            理论目标量 {number(stoich.value.moles)} mol /{" "}
            {number(stoich.value.grams)} g
          </p>
        ) : (
          <p className={styles.error}>{stoich.error}</p>
        )}
        <small>假设已知反应物为限制反应物，完全反应且理论产率 100%。</small>
      </section>
    </>
  );
}
function ComputerScience() {
  const [pattern, setPattern] = useState("(\\w+)@(\\w+\\.\\w+)"),
    [flags, setFlags] = useState("gi"),
    [text, setText] = useState("Contact alice@example.com or bob@campus.edu"),
    [matches, setMatches] = useState<RegexMatch[]>([]),
    [regexError, setRegexError] = useState(""),
    [width, setWidth] = useState<32 | 64>(32),
    [raw, setRaw] = useState("0x2A"),
    [cidr, setCidr] = useState("192.168.1.42/24");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void regexMatchesAsync(pattern, flags, text)
        .then((m) => {
          if (active) {
            setMatches(m);
            setRegexError("");
          }
        })
        .catch((e) => {
          if (active) {
            setRegexError(e.message);
            setMatches([]);
          }
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pattern, flags, text]);
  const bit = calc(() => parseBits(raw, width)),
    network = calc(() => cidrSubnet(cidr));
  const highlighted = useMemo(() => {
    let index = 0;
    const nodes: React.ReactNode[] = [];
    matches.forEach((m, i) => {
      nodes.push(
        text.slice(index, m.index),
        <mark
          key={i}
          title={m.groups
            .map((g, j) => `$${j + 1}: ${g ?? "未匹配"}`)
            .join("\n")}
        >
          {m.text || "▏"}
        </mark>,
      );
      index = m.index + m.text.length;
    });
    nodes.push(text.slice(index));
    return nodes;
  }, [text, matches]);
  return (
    <>
      <section className={styles.card}>
        <h3>正则表达式测试</h3>
        <div className={styles.grid}>
          <label>
            表达式
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              maxLength={1000}
            />
          </label>
          <label>
            标志
            <input
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              maxLength={8}
            />
          </label>
        </div>
        <label>
          测试文本
          <textarea
            value={text}
            rows={3}
            maxLength={50000}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {regexError ? (
          <p className={styles.error} role="alert">
            {regexError}
          </p>
        ) : (
          <>
            <div className={`${styles.output} ${styles.regexText}`}>
              {highlighted}
            </div>
            <p>
              {matches.length} 个匹配
              {matches.length === 500 ? "（最多显示 500 个）" : ""}
            </p>
            <div className={styles.output}>
              {matches.slice(0, 30).map((m, i) => (
                <div key={i}>
                  #{i + 1} @{m.index}{" "}
                  {m.groups.map((g, j) => (
                    <span key={j}>
                      {" "}
                      · ${j + 1}=<mark>{g ?? "未匹配"}</mark>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        <small>独立 Worker 执行；超时会终止，避免复杂表达式卡住页面。</small>
      </section>
      <section className={styles.card}>
        <h3>二进制 / 十六进制位翻转</h3>
        <div className={styles.toolbar}>
          <button
            aria-pressed={width === 32}
            onClick={() => {
              setWidth(32);
              setRaw("0");
            }}
          >
            32 位
          </button>
          <button aria-pressed={width === 64} onClick={() => setWidth(64)}>
            64 位
          </button>
        </div>
        <label>
          无符号整数
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            maxLength={80}
          />
        </label>
        {bit.value !== null ? (
          <>
            <p className={styles.output}>
              DEC {bit.value.toString()}
              <br />
              HEX 0x
              {bit.value
                .toString(16)
                .toUpperCase()
                .padStart(width / 4, "0")}
              <br />
              BIN {bit.value.toString(2).padStart(width, "0")}
            </p>
            <div className={styles.bits}>
              {Array.from({ length: width }, (_, i) => {
                const index = width - 1 - i,
                  on = !!(bit.value! & (1n << BigInt(index)));
                return (
                  <button
                    key={index}
                    aria-label={`位 ${index}`}
                    aria-pressed={on}
                    onClick={() =>
                      setRaw(
                        "0x" + flipBit(bit.value!, index, width).toString(16),
                      )
                    }
                  >
                    <small>{index}</small>
                    {on ? 1 : 0}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className={styles.error}>{bit.error}</p>
        )}
      </section>
      <section className={styles.card}>
        <h3>IPv4 / IPv6 CIDR</h3>
        <label>
          地址 / 前缀
          <input
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
            placeholder="2001:db8::1/64"
            maxLength={80}
          />
        </label>
        {network.value ? (
          <div className={styles.output}>
            网络：{network.value.network}/{network.value.prefix}
            <br />
            掩码：{network.value.mask}
            <br />
            地址总数：{network.value.count}
            <br />
            范围：{network.value.network} — {network.value.last}
            <br />
            {network.value.version === 4 ? (
              <>
                可用主机：{network.value.usable}
                <br />
                主机范围：{network.value.firstHost} — {network.value.lastHost}
                <br />
                广播：{network.value.broadcast || "无（/31 点到点或 /32 主机）"}
              </>
            ) : (
              <>IPv6 无广播；以上为数学地址范围，实际主机分配需考虑保留地址。</>
            )}
          </div>
        ) : (
          <p className={styles.error}>{network.error}</p>
        )}
      </section>
    </>
  );
}
export default function DisciplineToolbox({
  onClose,
}: {
  onClose: () => void;
}) {
  const [tab, setTab] = useState("medical");
  return (
    <CampusDialog title="专业百宝箱" onClose={onClose}>
      <div className={styles.tools}>
        <div className={styles.tabs} role="tablist" aria-label="专业计算器">
          {[
            ["medical", "临床医学"],
            ["chem", "化学化工"],
            ["ee", "电气工程"],
            ["arch", "建筑设计"],
            ["cs", "计算机科学"],
            ["security", "网络安全"],
          ].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" key={tab}>
          {tab === "medical" ? (
            <JuniorMedical />
          ) : tab === "chem" ? (
            <>
              <JuniorChemistry />
              <details>
                <summary>元素周期表与基础化学速算</summary>
                <Chemistry />
              </details>
            </>
          ) : tab === "ee" ? (
            <>
              <JuniorElectrical />
              <details>
                <summary>电阻色环与 RC / RLC / 运放</summary>
                <Electrical />
              </details>
            </>
          ) : tab === "arch" ? (
            <>
              <JuniorArchitecture />
              <details>
                <summary>楼梯 / 坡道 / 停车规范交互检查</summary>
                <ArchitectureReference />
              </details>
              <details>
                <summary>基础建筑速算与用地指标</summary>
                <Architecture />
              </details>
            </>
          ) : tab === "cs" ? (
            <>
              <JuniorSystems />
              <details>
                <summary>BST / Dijkstra / QuickSort 算法步进演示</summary>
                <AlgorithmVisualizer />
              </details>
              <details>
                <summary>正则、CIDR 与二进制位翻转</summary>
                <ComputerScience />
              </details>
            </>
          ) : (
            <>
              <JuniorCrypto />
              <details>
                <summary>密码识别瀑布与 JWT 检查</summary>
                <CipherWaterfall />
              </details>
            </>
          )}
        </div>
      </div>
    </CampusDialog>
  );
}
