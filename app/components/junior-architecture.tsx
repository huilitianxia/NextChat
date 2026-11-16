"use client";
import { useState } from "react";
import {
  solarPosition,
  solarTermDate,
  sunlightDuration,
  shadowVector,
  thermalEnvelope,
  ThermalLayer,
} from "../utils/junior-architecture";
import {
  calculate,
  num,
  NumberFields,
  Section,
  Result,
  Reference,
  Note,
  Select,
  Plot,
  TextField,
  styles,
  junior,
} from "./junior-shared";
const initialLayers: ThermalLayer[] = [
  { name: "内抹灰", thicknessMm: 20, conductivity: 0.7 },
  { name: "混凝土", thicknessMm: 200, conductivity: 1.74 },
  { name: "EPS 保温", thicknessMm: 80, conductivity: 0.039 },
];
const standards = {
  cold2: {
    hours: 2,
    start: 8,
    end: 16,
    term: "cold",
    label: "Ⅰ/Ⅱ/Ⅲ/Ⅶ 区，≥50万人 · 大寒 2h",
  },
  cold3: {
    hours: 3,
    start: 8,
    end: 16,
    term: "cold",
    label: "Ⅰ/Ⅱ/Ⅲ/Ⅶ 区，<50万人；Ⅳ区≥50万人 · 大寒 3h",
  },
  winter1: {
    hours: 1,
    start: 9,
    end: 15,
    term: "winter",
    label: "Ⅳ区<50万人；Ⅴ/Ⅵ区 · 冬至 1h",
  },
  elder: {
    hours: 2,
    start: 9,
    end: 15,
    term: "winter",
    label: "老年人居住建筑 · 冬至 2h",
  },
} as const;
export default function JuniorArchitecture() {
  const [v, setV] = useState({
      latitude: 31.23,
      longitude: 121.47,
      timezone: 8,
      hour: 12,
      distance: 25,
      heightDifference: 15,
      width: 40,
      facadeBearing: 180,
      start: 8,
      end: 16,
      requiredHours: 2,
      stick: 2,
    }),
    [date, setDate] = useState("2026-01-20"),
    [solarTime, setSolarTime] = useState(true),
    [standard, setStandard] = useState("cold2"),
    [layers, setLayers] = useState(initialLayers),
    [thermal, setThermal] = useState({
      inside: 0.11,
      outside: 0.04,
      limit: 0.8,
    });
  const position = calculate(() => solarPosition({ ...v, date, solarTime })),
    day = calculate(() => sunlightDuration({ ...v, date, solarTime })),
    path = calculate(() =>
      Array.from({ length: 97 }, (_, i) => {
        const s = solarPosition({ ...v, date, solarTime, hour: i / 4 });
        return { ...s, x: i / 4, y: s.altitude };
      }),
    ),
    shadow = calculate(() =>
      position.value ? shadowVector(v.stick, position.value) : null,
    ),
    wall = calculate(() =>
      thermalEnvelope(layers, thermal.inside, thermal.outside, thermal.limit),
    );
  const sText =
    position.value && day.value
      ? `位置 ${v.latitude}°N / ${v.longitude}°E，时区 UTC${
          v.timezone >= 0 ? "+" : ""
        }${v.timezone}，日期 ${date}，${solarTime ? "真太阳时" : "钟表时"} ${
          v.hour
        } h。\n太阳几何高度=${num(position.value.altitude)}°，方位角=${num(
          position.value.azimuth,
        )}°（北0，顺时针）；真太阳时=${num(
          position.value.solarHour,
        )} h，钟表时=${num(position.value.clockHour)} h。\n立面朝向=${
          v.facadeBearing
        }°，正前方矩形遮挡体：距计算点 ${v.distance} m、高差 ${
          v.heightDifference
        } m、宽 ${v.width} m。有效时段 ${v.start}–${
          v.end
        } h；模型直射时长=${num(day.value.hours)} h（${num(
          day.value.minutes,
        )} min），参考 ${v.requiredHours} h：${
          day.value.meetsReference ? "达到所填参考时数" : "未达到所填参考时数"
        }。${
          shadow.value
            ? `\n${v.stick} m 标杆影长=${num(
                shadow.value.length,
              )} m；东向=${num(shadow.value.east)} m，北向=${num(
                shadow.value.north,
              )} m。`
            : ""
        }`
      : "";
  const wallText = wall.value
    ? `围护结构各层：\n${layers
        .map(
          (l, i) =>
            `${l.name}：d=${l.thicknessMm} mm，λ=${
              l.conductivity
            } W/(m·K)，R=${num(wall.value!.resistances[i])} m²·K/W`,
        )
        .join("\n")}\nRsi=${thermal.inside}，Rse=${
        thermal.outside
      } m²·K/W；R₀=Rsi+Σ(d/λ)+Rse=${num(
        wall.value.resistance,
      )} m²·K/W；K=1/R₀=${num(wall.value.uValue)} W/(m²·K)。\n对照自填限值 ${
        thermal.limit
      } W/(m²·K)：${wall.value.meetsReference ? "满足此限值" : "超过此限值"}。`
    : "";
  function selectStandard(id: string) {
    setStandard(id);
    if (id === "custom") return;
    const item = standards[id as keyof typeof standards];
    const year = Number(date.slice(0, 4)) || 2026;
    try {
      setDate(solarTermDate(year, item.term, v.timezone));
    } catch {
      setDate(solarTermDate(2026, item.term, 8));
    }
    setSolarTime(true);
    setV({ ...v, start: item.start, end: item.end, requiredHours: item.hours });
  }
  return (
    <div className={styles.tools}>
      <Section
        title="太阳轨迹 · 冬至 / 大寒日照模型"
        preset={() => {
          setV({
            latitude: 31.23,
            longitude: 121.47,
            timezone: 8,
            hour: 12,
            distance: 25,
            heightDifference: 15,
            width: 40,
            facadeBearing: 180,
            start: 8,
            end: 16,
            requiredHours: 2,
            stick: 2,
          });
          setDate("2026-01-20");
          setSolarTime(true);
          setStandard("cold2");
        }}
      >
        <Select
          label="日照参考条件（GB 50180—2018）"
          value={standard}
          set={selectStandard}
          options={[
            ...Object.entries(standards).map(
              ([key, item]) => [key, item.label] as const,
            ),
            ["custom", "自定义项目条件"],
          ]}
        />
        <Note>
          按所选气候区、城区常住人口与用途核对适用条件。预设时段为真太阳时；修改日期、时段或阈值后视为自定义对照。单个计算点、单遮挡体结果不能替代整栋住宅日照审批。
        </Note>
        <div className={styles.grid}>
          <label>
            计算日期
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setStandard("custom");
              }}
            />
          </label>
          <Select
            label="时间基准"
            value={solarTime ? "solar" : "clock"}
            set={(v) => {
              setSolarTime(v === "solar");
              setStandard("custom");
            }}
            options={[
              ["solar", "当地真太阳时"],
              ["clock", "当地时区钟表时"],
            ]}
          />
        </div>
        <NumberFields
          value={v}
          set={(next) => {
            if (
              next.start !== v.start ||
              next.end !== v.end ||
              next.requiredHours !== v.requiredHours
            )
              setStandard("custom");
            setV(next);
          }}
          fields={[
            ["latitude", "纬度 / °（北正南负）"],
            ["longitude", "经度 / °（东正西负）"],
            ["timezone", "UTC 时差 / h"],
            ["hour", "观察时刻 / h"],
            ["distance", "前方遮挡体距离 / m"],
            ["heightDifference", "遮挡体高于计算点 / m"],
            ["width", "遮挡体宽度 / m"],
            ["facadeBearing", "立面朝向 / °（北0、东90）"],
            ["start", "有效日照起始 / h"],
            ["end", "有效日照结束 / h"],
            ["requiredHours", "参考日照时数 / h"],
            ["stick", "影长示意标杆高度 / m"],
          ]}
        />
        <Result
          text={sText}
          error={position.error || day.error || shadow.error}
        />
        {path.value && (
          <Plot
            title="太阳高度日轨迹"
            points={path.value}
            xLabel={solarTime ? "当地真太阳时 / h" : "当地钟表时 / h"}
            yLabel="几何太阳高度 / °"
            markerX={v.hour}
          />
        )}
        {position.value && path.value && (
          <svg
            className={junior.plot}
            viewBox="0 0 600 280"
            role="img"
            aria-label="太阳方位轨迹与标杆阴影"
          >
            <circle
              cx="145"
              cy="135"
              r="92"
              fill="none"
              stroke="currentColor"
              opacity=".3"
            />
            <path
              d="M145 40V230M50 135H240"
              stroke="currentColor"
              opacity=".15"
            />
            <polyline
              points={path.value
                .filter((s) => s.daylight)
                .map(
                  (s) =>
                    `${
                      145 +
                      92 *
                        Math.cos((s.altitude * Math.PI) / 180) *
                        Math.sin((s.azimuth * Math.PI) / 180)
                    },${
                      135 -
                      92 *
                        Math.cos((s.altitude * Math.PI) / 180) *
                        Math.cos((s.azimuth * Math.PI) / 180)
                    }`,
                )
                .join(" ")}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
            {position.value.daylight && (
              <circle
                cx={
                  145 +
                  92 *
                    Math.cos((position.value.altitude * Math.PI) / 180) *
                    Math.sin((position.value.azimuth * Math.PI) / 180)
                }
                cy={
                  135 -
                  92 *
                    Math.cos((position.value.altitude * Math.PI) / 180) *
                    Math.cos((position.value.azimuth * Math.PI) / 180)
                }
                r="7"
                fill="#e4ad4a"
              />
            )}
            <text x="140" y="29" fill="currentColor">
              N
            </text>
            <text x="252" y="139" fill="currentColor">
              E
            </text>
            <text x="140" y="249" fill="currentColor">
              S
            </text>
            <text x="28" y="139" fill="currentColor">
              W
            </text>
            <text
              x="145"
              y="270"
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
            >
              太阳轨迹 · 外圈为地平线
            </text>
            <circle
              cx="440"
              cy="135"
              r="90"
              fill="none"
              stroke="currentColor"
              opacity=".2"
            />
            <text x="435" y="30" fill="currentColor">
              N
            </text>
            <text x="540" y="140" fill="currentColor">
              E
            </text>
            {shadow.value && (
              <line
                x1="440"
                y1="135"
                x2={
                  440 +
                  (shadow.value.east / Math.max(1, shadow.value.length)) * 80
                }
                y2={
                  135 -
                  (shadow.value.north / Math.max(1, shadow.value.length)) * 80
                }
                stroke="#8495ad"
                strokeWidth="8"
                strokeLinecap="round"
              />
            )}
            <circle cx="440" cy="135" r="5" fill="var(--primary)" />
            <text
              x="440"
              y="250"
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
            >
              标杆顶视 ·{" "}
              {shadow.value
                ? `影长 ${num(shadow.value.length, 5)} m`
                : "无直射阴影"}
            </text>
            <text
              x="440"
              y="270"
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
            >
              影长缩放以适应画面
            </text>
          </svg>
        )}
        {day.value && (
          <>
            <svg
              className={junior.plot}
              viewBox="0 0 600 54"
              role="img"
              aria-label="有效时段遮挡轨迹"
            >
              {day.value.samples.map((s, i) => (
                <rect
                  key={i}
                  x={20 + (560 * i) / day.value!.samples.length}
                  y="8"
                  width={560 / day.value!.samples.length + 0.2}
                  height="19"
                  fill={
                    s.visible ? "#429b7e" : s.blocked ? "#dd8763" : "#96a0ae"
                  }
                />
              ))}
              <text x="20" y="45" fontSize="11" fill="currentColor">
                {v.start}h　绿色：可见直射 / 橙色：遮挡 / 灰色：无立面直射　
                {v.end}h
              </text>
            </svg>
            <Note>
              NOAA / Meeus 数值太阳位置；日照时数以 ≤1
              分钟步长积分。太阳中心几何角度，不含折射、地形、云量、多建筑遮挡、窗宽与连续时段规则。修改几何后会立即重新计算。
            </Note>
          </>
        )}
        {sText && (
          <Reference
            title="建筑日照教学计算"
            text={
              sText +
              "\n本结果为单点 / 单矩形遮挡体教学模型，非完整住宅规范审查。"
            }
          />
        )}
      </Section>
      <Section
        title="围护结构 · 多层热阻与传热系数"
        preset={() => {
          setLayers(initialLayers.map((l) => ({ ...l })));
          setThermal({ inside: 0.11, outside: 0.04, limit: 0.8 });
        }}
      >
        <div className={junior.layers}>
          {layers.map((l, i) => (
            <div key={i} className={junior.layer}>
              <TextField
                label={`第 ${i + 1} 层材料`}
                value={l.name}
                set={(name) =>
                  setLayers(
                    layers.map((item, j) =>
                      j === i ? { ...item, name } : item,
                    ),
                  )
                }
              />
              <label>
                厚度 / mm
                <input
                  type="number"
                  value={Number.isNaN(l.thicknessMm) ? "" : l.thicknessMm}
                  onChange={(e) =>
                    setLayers(
                      layers.map((item, j) =>
                        j === i
                          ? {
                              ...item,
                              thicknessMm:
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                λ / W·m⁻¹·K⁻¹
                <input
                  type="number"
                  step="any"
                  value={Number.isNaN(l.conductivity) ? "" : l.conductivity}
                  onChange={(e) =>
                    setLayers(
                      layers.map((item, j) =>
                        j === i
                          ? {
                              ...item,
                              conductivity:
                                e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <button
                disabled={layers.length <= 1}
                aria-label={`删除第 ${i + 1} 层`}
                onClick={() => setLayers(layers.filter((_, j) => i !== j))}
              >
                删除
              </button>
            </div>
          ))}
        </div>
        <button
          disabled={layers.length >= 20}
          onClick={() =>
            setLayers([
              ...layers,
              { name: "新材料", thicknessMm: 20, conductivity: 0.7 },
            ])
          }
        >
          添加材料层
        </button>
        <NumberFields
          value={thermal}
          set={setThermal}
          fields={[
            ["inside", "内表面热阻 Rsi / m²·K·W⁻¹"],
            ["outside", "外表面热阻 Rse / m²·K·W⁻¹"],
            ["limit", "项目 K 限值 / W·m⁻²·K⁻¹"],
          ]}
        />
        <Result text={wallText} error={wall.error} />
        {wall.value && (
          <Reference
            title="围护结构热工"
            text={
              wallText +
              "\n一维稳态、连续均质层；未计热桥、空气渗透和湿度影响，限值需按项目地区、建筑类型及规范版本确认。"
            }
          />
        )}
        <Note>
          例题表面热阻只是竖向围护结构的设定值；墙、屋面及传热方向不同应修改。K
          限值由项目适用规范提供，本例 0.8 不代表通用法规要求。
        </Note>
      </Section>
    </div>
  );
}
