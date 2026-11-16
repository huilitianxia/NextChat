export function finite(...values: number[]) {
  if (values.some((n) => !Number.isFinite(n)))
    throw new Error("请输入有限的有效数字。");
}
export function positive(...values: number[]) {
  finite(...values);
  if (values.some((n) => n <= 0)) throw new Error("输入值必须大于 0。");
}
export function range(value: number, min: number, max: number, label = "输入") {
  finite(value);
  if (value < min || value > max)
    throw new Error(`${label}须在 ${min}–${max} 之间。`);
}
export type Point = { x: number; y: number };
export function boundedResult<T extends Record<string, number>>(result: T): T {
  finite(...Object.values(result));
  return result;
}
