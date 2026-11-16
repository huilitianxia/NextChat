"use client";
import { useState } from "react";
import {
  pageReplacement,
  PagingMethod,
  scheduleProcesses,
  ScheduleMethod,
  inspectFloat,
} from "../utils/junior-systems";
import {
  calculate,
  num,
  NumberFields,
  Section,
  Result,
  Reference,
  Note,
  Select,
  TextField,
  styles,
  junior,
} from "./junior-shared";
const METHODS = ["FIFO", "LRU", "OPT"] as const,
  SCHEDULES = ["FCFS", "SJF", "RR"] as const;
export default function JuniorSystems() {
  const [refs, setRefs] = useState("7 0 1 2 0 3 0 4 2 3 0 3 2"),
    [frames, setFrames] = useState(3),
    [paging, setPaging] = useState<PagingMethod>("FIFO"),
    [step, setStep] = useState(0),
    [processes, setProcesses] = useState("P1 0 5\nP2 1 3\nP3 2 1"),
    [schedule, setSchedule] = useState<ScheduleMethod>("RR"),
    [quantum, setQuantum] = useState(2),
    [segment, setSegment] = useState(0),
    [float, setFloat] = useState("0.1"),
    [width, setWidth] = useState<32 | 64>(32),
    [floatMode, setFloatMode] = useState<"decimal" | "hex">("decimal");
  const pages = calculate(() => {
    if (!refs.trim()) throw new Error("请输入页号引用串。");
    const list = refs
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    return METHODS.map((method) => ({
      method,
      ...pageReplacement(list, frames, method),
    }));
  });
  const scheduled = calculate(() => {
    if (!processes.trim()) throw new Error("请输入进程。");
    const list = processes
      .trim()
      .split(/\n/)
      .map((line) => {
        const fields = line.trim().split(/[\s,]+/);
        if (fields.length !== 3)
          throw new Error("每行格式：进程ID 到达时间 运行时间。");
        return {
          id: fields[0],
          arrival: Number(fields[1]),
          burst: Number(fields[2]),
        };
      });
    return SCHEDULES.map((method) => ({
      method,
      ...scheduleProcesses(list, method, quantum),
    }));
  });
  const bits = calculate(() => inspectFloat(float, width, floatMode)),
    selected = pages.value?.find((p) => p.method === paging),
    active = selected ? Math.min(step, selected.steps.length - 1) : 0,
    cpu = scheduled.value?.find((s) => s.method === schedule),
    si = cpu ? Math.min(segment, cpu.segments.length - 1) : 0;
  const pageText = pages.value
    ? `页号引用串：${refs}；物理帧=${frames}。\n${pages.value
        .map(
          (p) =>
            `${p.method}：缺页 ${p.faults}/${p.steps.length}，命中 ${
              p.hits
            }，缺页率 ${num(p.rate * 100)}%`,
        )
        .join("\n")}\nOPT 需要未来访问序列，是离线比较基准。`
    : "";
  const cpuText = cpu
    ? `进程：\n${processes}\n算法 ${schedule}${
        schedule === "RR" ? `，时间片 ${quantum}` : "（非抢占）"
      }；平均周转=${num(cpu.averageTurnaround)}，等待=${num(
        cpu.averageWaiting,
      )}，响应=${num(cpu.averageResponse)} 时间单位。\n${cpu.results
        .map(
          (p) =>
            `${p.id}：完成 ${p.completion}，周转 ${p.turnaround}，等待 ${p.waiting}，响应 ${p.response}`,
        )
        .join("\n")}\n甘特：${cpu.segments
        .map((s) => `${s.id}[${s.start},${s.end})`)
        .join(" → ")}`
    : "";
  const floatText = bits.value
    ? `IEEE 754 binary${width}；输入（${floatMode}）=${float}，实际存储值=${
        bits.value.display
      }。\nHEX=${bits.value.hex}；分类=${bits.value.kind}。符号=${
        bits.value.sign
      }；指数域=${bits.value.exponentBits}（${bits.value.exponent}），偏置=${
        bits.value.bias
      }；无偏指数=${bits.value.unbiasedExponent ?? "特殊值"}。\n尾数域=${
        bits.value.fractionBits
      }；尾数字段整数=${bits.value.fraction}。${
        bits.value.kind === "normal"
          ? "隐含前导 1。"
          : bits.value.kind === "subnormal"
          ? "非规格化数，隐含前导 0。"
          : ""
      }`
    : "";
  return (
    <div className={styles.tools}>
      <Section
        title="页面置换 · FIFO / LRU / OPT"
        preset={() => {
          setRefs("7 0 1 2 0 3 0 4 2 3 0 3 2");
          setFrames(3);
          setStep(0);
        }}
      >
        <TextField
          label="页号引用串（空格 / 逗号分隔）"
          value={refs}
          set={setRefs}
        />
        <NumberFields
          value={{ frames }}
          set={(v) => setFrames(v.frames)}
          fields={[["frames", "物理帧数量 / 1–8"]]}
        />
        <Result text={pageText} error={pages.error} />
        {selected && (
          <>
            <Select
              label="逐步查看置换算法"
              value={paging}
              set={setPaging}
              options={METHODS.map((m) => [m, m])}
            />
            <label>
              置换步骤 {active + 1}/{selected.steps.length}
              <input
                aria-label="置换步骤"
                type="range"
                min="0"
                max={selected.steps.length - 1}
                value={active}
                onChange={(e) => setStep(Number(e.target.value))}
              />
            </label>
            <p>
              访问页 {selected.steps[active].page}：
              {selected.steps[active].hit
                ? "命中"
                : `缺页${
                    selected.steps[active].replaced === null
                      ? "，填入空帧"
                      : `，淘汰页 ${selected.steps[active].replaced}`
                  }`}
            </p>
            <div className={junior.matrix}>
              <table>
                <caption>{paging} 帧分配矩阵 · 当前步骤高亮</caption>
                <thead>
                  <tr>
                    <th>访问</th>
                    {selected.steps.map((s, i) => (
                      <th
                        key={i}
                        style={{
                          background:
                            i === active ? "var(--primary)" : undefined,
                          color: i === active ? "#fff" : undefined,
                        }}
                      >
                        {s.page}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: frames }, (_, f) => (
                    <tr key={f}>
                      <th>帧 {f + 1}</th>
                      {selected.steps.map((s, i) => (
                        <td
                          key={i}
                          style={{
                            opacity: i > active ? 0.35 : 1,
                            background:
                              i === active ? "var(--second)" : undefined,
                          }}
                        >
                          {s.frames[f] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th>缺页</th>
                    {selected.steps.map((s, i) => (
                      <td key={i}>{s.hit ? "·" : "×"}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <Reference title="页面置换比较" text={pageText} />
          </>
        )}
      </Section>
      <Section
        title="CPU 调度 · 甘特图"
        preset={() => {
          setProcesses("P1 0 5\nP2 1 3\nP3 2 1");
          setQuantum(2);
          setSchedule("RR");
          setSegment(0);
        }}
      >
        <label>
          进程列表（每行：ID 到达 运行）
          <textarea
            aria-label="进程列表"
            rows={4}
            value={processes}
            maxLength={1500}
            onChange={(e) => setProcesses(e.target.value)}
          />
        </label>
        <div className={styles.grid}>
          <Select
            label="调度算法"
            value={schedule}
            set={setSchedule}
            options={[
              ["FCFS", "FCFS 先来先服务"],
              ["SJF", "SJF 非抢占短作业优先"],
              ["RR", "RR 时间片轮转"],
            ]}
          />
          <NumberFields
            value={{ quantum }}
            set={(v) => setQuantum(v.quantum)}
            fields={[["quantum", "RR 时间片"]]}
          />
        </div>
        {scheduled.value && (
          <div className={junior.matrix}>
            <table>
              <caption>三种调度算法比较</caption>
              <thead>
                <tr>
                  <th>算法</th>
                  <th>平均周转</th>
                  <th>平均等待</th>
                  <th>平均响应</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.value.map((s) => (
                  <tr key={s.method}>
                    <td>{s.method}</td>
                    <td>{num(s.averageTurnaround, 6)}</td>
                    <td>{num(s.averageWaiting, 6)}</td>
                    <td>{num(s.averageResponse, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Result text={cpuText} error={scheduled.error} />
        {cpu && (
          <>
            <svg
              className={junior.plot}
              viewBox="0 0 600 88"
              role="img"
              aria-label="CPU 甘特图"
            >
              {cpu.segments.map((s, i) => {
                const total = cpu.segments.at(-1)!.end,
                  xx = 20 + (560 * s.start) / total,
                  w = (560 * (s.end - s.start)) / total;
                return (
                  <g key={i}>
                    <title>
                      {s.id}：{s.start}–{s.end}
                    </title>
                    <rect
                      x={xx}
                      y="14"
                      width={w}
                      height="35"
                      fill={
                        s.id === "空闲"
                          ? "#9b9fa7"
                          : ["#428d78", "#6384b5", "#b18a55", "#9465ad"][
                              Math.max(
                                0,
                                cpu.results.findIndex((p) => p.id === s.id),
                              ) % 4
                            ]
                      }
                      stroke={i === si ? "currentColor" : "var(--white)"}
                      strokeWidth={i === si ? 3 : 1}
                    />
                    {w > 24 && (
                      <text
                        x={xx + w / 2}
                        y="36"
                        textAnchor="middle"
                        fontSize="10"
                        fill="white"
                      >
                        {s.id}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x="20" y="72" fontSize="12" fill="currentColor">
                0
              </text>
              <text
                x="580"
                y="72"
                textAnchor="end"
                fontSize="12"
                fill="currentColor"
              >
                {cpu.segments.at(-1)!.end} 时间单位
              </text>
            </svg>
            <label>
              调度片段 {si + 1}：{cpu.segments[si].id}，{cpu.segments[si].start}
              –{cpu.segments[si].end}
              <input
                aria-label="调度片段"
                type="range"
                min="0"
                max={cpu.segments.length - 1}
                value={si}
                onChange={(e) => setSegment(Number(e.target.value))}
              />
            </label>
            <Reference title="CPU 调度" text={cpuText} />
          </>
        )}
        <Note>
          无切换开销；同到达时间按输入顺序。RR
          在时间片结束时先加入新到达进程，再将未完成进程放回队尾。
        </Note>
      </Section>
      <Section title="IEEE 754 · 单 / 双精度浮点位模式">
        <div className={styles.grid}>
          <Select
            label="浮点位宽"
            value={String(width)}
            set={(v) => {
              const w = Number(v) as 32 | 64;
              setWidth(w);
              if (floatMode === "hex")
                setFloat(w === 32 ? "3F800000" : "3FF0000000000000");
            }}
            options={[
              ["32", "32 位 binary32"],
              ["64", "64 位 binary64"],
            ]}
          />
          <Select
            label="浮点输入方式"
            value={floatMode}
            set={(mode) => {
              setFloatMode(mode);
              setFloat(
                mode === "hex"
                  ? width === 32
                    ? "3F800000"
                    : "3FF0000000000000"
                  : "0.1",
              );
            }}
            options={[
              ["decimal", "十进制数"],
              ["hex", "原始十六进制位模式"],
            ]}
          />
        </div>
        <TextField label="浮点输入值" value={float} set={setFloat} max={100} />
        <Result text={floatText} error={bits.error} />
        {bits.value && (
          <>
            <div className={junior.bitrow} aria-label="符号 指数 尾数位">
              <span className={junior.sign}>{bits.value.sign}</span>
              {bits.value.exponentBits.split("").map((bit, i) => (
                <span className={junior.exponent} key={`e${i}`}>
                  {bit}
                </span>
              ))}
              {bits.value.fractionBits.split("").map((bit, i) => (
                <span key={`f${i}`}>{bit}</span>
              ))}
            </div>
            <Note>
              橙：符号，绿：指数，蓝：尾数。十进制先按 JavaScript binary64
              解析，再转指定精度；精确检查特殊 NaN
              负载等应输入原始十六进制模式。
            </Note>
            <Reference title="IEEE 754" text={floatText} />
          </>
        )}
      </Section>
    </div>
  );
}
