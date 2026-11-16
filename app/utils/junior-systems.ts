import { range } from "./junior-common";
export type PagingMethod = "FIFO" | "LRU" | "OPT";
export function pageReplacement(
  references: number[],
  frameCount: number,
  method: PagingMethod,
) {
  range(frameCount, 1, 8, "物理帧数");
  if (
    !Number.isInteger(frameCount) ||
    !references.length ||
    references.length > 80 ||
    references.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    !["FIFO", "LRU", "OPT"].includes(method)
  )
    throw new Error("页号须为非负安全整数，引用串 1–80 项，帧数为整数。");
  const frames: (number | null)[] = Array(frameCount).fill(null),
    last = new Map<number, number>();
  let next = 0,
    faults = 0;
  const steps = references.map((page, i) => {
    const hit = frames.includes(page);
    let replaced: number | null = null,
      slot = frames.indexOf(page);
    if (!hit) {
      faults++;
      slot = frames.indexOf(null);
      if (slot < 0) {
        if (method === "FIFO") {
          slot = next;
          next = (next + 1) % frameCount;
        } else if (method === "LRU") {
          slot = frames.reduce<number>(
            (best, p, j) =>
              (last.get(p!) ?? -1) < (last.get(frames[best]!) ?? -1) ? j : best,
            0,
          );
        } else {
          let far = -1;
          frames.forEach((p, j) => {
            const index = references.indexOf(p!, i + 1),
              distance = index < 0 ? Infinity : index;
            if (distance > far) {
              far = distance;
              slot = j;
            }
          });
        }
        replaced = frames[slot];
      }
      frames[slot] = page;
    }
    last.set(page, i);
    return { page, hit, slot, replaced, frames: [...frames] };
  });
  return {
    faults,
    hits: references.length - faults,
    rate: faults / references.length,
    steps,
  };
}
export type ProcessInput = { id: string; arrival: number; burst: number };
export type ScheduleMethod = "FCFS" | "SJF" | "RR";
export function scheduleProcesses(
  input: ProcessInput[],
  method: ScheduleMethod,
  quantum = 2,
) {
  if (
    !input.length ||
    input.length > 15 ||
    new Set(input.map((p) => p.id)).size !== input.length ||
    input.some(
      (p) =>
        !p.id.trim() ||
        p.id.length > 24 ||
        !Number.isInteger(p.arrival) ||
        p.arrival < 0 ||
        p.arrival > 100000 ||
        !Number.isInteger(p.burst) ||
        p.burst < 1,
    ) ||
    input.reduce((n, p) => n + p.burst, 0) > 10000
  )
    throw new Error(
      "进程 1–15 个，ID 唯一，非负整数到达时间，正整数运行时间，总运行量 ≤10000。",
    );
  if (
    !["FCFS", "SJF", "RR"].includes(method) ||
    !Number.isInteger(quantum) ||
    quantum < 1
  )
    throw new Error("调度类型或时间片无效。");
  const jobs = input.map((p, index) => ({
      ...p,
      index,
      remaining: p.burst,
      first: -1,
      completion: 0,
    })),
    pending = [...jobs].sort(
      (a, b) => a.arrival - b.arrival || a.index - b.index,
    ),
    queue: typeof jobs = [];
  const segments: { id: string; start: number; end: number }[] = [];
  let time = 0;
  const enqueue = () => {
    while (pending.length && pending[0].arrival <= time)
      queue.push(pending.shift()!);
  };
  while (pending.length || queue.length) {
    enqueue();
    if (!queue.length) {
      segments.push({ id: "空闲", start: time, end: pending[0].arrival });
      time = pending[0].arrival;
      enqueue();
    }
    if (method === "SJF")
      queue.sort(
        (a, b) =>
          a.burst - b.burst || a.arrival - b.arrival || a.index - b.index,
      );
    const job = queue.shift()!,
      duration =
        method === "RR" ? Math.min(quantum, job.remaining) : job.remaining;
    if (job.first < 0) job.first = time;
    segments.push({ id: job.id, start: time, end: time + duration });
    time += duration;
    job.remaining -= duration;
    enqueue();
    if (job.remaining) queue.push(job);
    else job.completion = time;
    if (segments.length > 2000)
      throw new Error("时间片过小，轨迹超过 2000 段，请增大时间片。");
  }
  const results = jobs.map((p) => ({
    id: p.id,
    arrival: p.arrival,
    burst: p.burst,
    completion: p.completion,
    turnaround: p.completion - p.arrival,
    waiting: p.completion - p.arrival - p.burst,
    response: p.first - p.arrival,
  }));
  return {
    segments,
    results,
    averageTurnaround:
      results.reduce((n, p) => n + p.turnaround, 0) / jobs.length,
    averageWaiting: results.reduce((n, p) => n + p.waiting, 0) / jobs.length,
    averageResponse: results.reduce((n, p) => n + p.response, 0) / jobs.length,
  };
}
export function inspectFloat(
  raw: string,
  width: 32 | 64,
  mode: "decimal" | "hex" = "decimal",
) {
  if (![32, 64].includes(width)) throw new Error("只支持 32/64 位。");
  const bytes = new ArrayBuffer(width / 8),
    view = new DataView(bytes);
  let bits: bigint, value: number;
  if (mode === "hex") {
    const text = raw.trim().replace(/^0x/i, "");
    if (!new RegExp(`^[0-9a-fA-F]{${width / 4}}$`).test(text))
      throw new Error(`请输入 ${width / 4} 位十六进制位模式。`);
    bits = BigInt("0x" + text);
    if (width === 32) view.setUint32(0, Number(bits), false);
    else view.setBigUint64(0, bits, false);
    value =
      width === 32 ? view.getFloat32(0, false) : view.getFloat64(0, false);
  } else {
    const text = raw.trim();
    if (
      !/^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|Infinity|NaN)$/i.test(text)
    )
      throw new Error("请输入十进制数、Infinity 或 NaN。");
    value = /nan/i.test(text)
      ? NaN
      : /infinity/i.test(text)
      ? text.startsWith("-")
        ? -Infinity
        : Infinity
      : Number(text);
    if (width === 32) view.setFloat32(0, value, false);
    else view.setFloat64(0, value, false);
    bits =
      width === 32
        ? BigInt(view.getUint32(0, false))
        : view.getBigUint64(0, false);
    value =
      width === 32 ? view.getFloat32(0, false) : view.getFloat64(0, false);
  }
  const expWidth = width === 32 ? 8 : 11,
    fractionWidth = width - expWidth - 1,
    bias = 2 ** (expWidth - 1) - 1,
    binary = bits.toString(2).padStart(width, "0"),
    sign = Number(binary[0]),
    exponentBits = binary.slice(1, 1 + expWidth),
    fractionBits = binary.slice(1 + expWidth),
    exponent = Number.parseInt(exponentBits, 2),
    fraction = bits & ((1n << BigInt(fractionWidth)) - 1n),
    maxExp = 2 ** expWidth - 1,
    kind =
      exponent === maxExp
        ? fraction === 0n
          ? "Infinity"
          : "NaN"
        : exponent === 0
        ? fraction === 0n
          ? "zero"
          : "subnormal"
        : "normal";
  return {
    width,
    value,
    display: Number.isNaN(value)
      ? "NaN"
      : Object.is(value, -0)
      ? "-0"
      : String(value),
    hex: bits
      .toString(16)
      .padStart(width / 4, "0")
      .toUpperCase(),
    binary,
    sign,
    exponentBits,
    fractionBits,
    exponent,
    fraction: fraction.toString(),
    unbiasedExponent:
      exponent === 0 ? 1 - bias : exponent === maxExp ? null : exponent - bias,
    kind,
    bias,
  };
}
