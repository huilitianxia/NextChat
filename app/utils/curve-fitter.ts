export type FitModel =
  | "linear"
  | "poly2"
  | "poly3"
  | "poly4"
  | "exponential"
  | "logarithmic"
  | "power";
export type DataPoint = { row: number; x: number; y: number };
export type FitResult = {
  model: FitModel;
  n: number;
  degree: number;
  center: number;
  scale: number;
  normalized: number[];
  coefficients: number[];
  r2: number | null;
  sse: number;
  equation: string;
  objective: string;
  xStats: ReturnType<typeof describe>;
  yStats: ReturnType<typeof describe>;
};
export type DataSheet = {
  name: string;
  rows: (string | number | boolean | null)[][];
  formulas: number;
};
export type LabData = { name: string; sheets: DataSheet[] };
const total = (values: number[]) => {
  let sum = 0,
    c = 0;
  for (const value of values) {
    const y = value - c,
      t = sum + y;
    c = t - sum - y;
    sum = t;
  }
  return sum;
};
export function describe(values: number[]) {
  if (!values.length || values.some((v) => !Number.isFinite(v)))
    throw new Error("统计需要有效数值。");
  const mean = total(values.map((v) => v / values.length)),
    variance =
      values.length > 1
        ? total(values.map((v) => (v - mean) ** 2)) / (values.length - 1)
        : null,
    sd = variance === null ? null : Math.sqrt(variance);
  return {
    n: values.length,
    mean,
    sd,
    rsd: sd === null || mean === 0 ? null : (sd / Math.abs(mean)) * 100,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
export function numericCell(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (
    typeof value !== "string" ||
    !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim())
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function pointsFromRows(
  rows: DataSheet["rows"],
  xColumn: number,
  yColumn: number,
  header = true,
) {
  const points: DataPoint[] = [],
    invalid: number[] = [];
  rows.forEach((row, i) => {
    if (header && i === 0) return;
    const x = numericCell(row[xColumn]),
      y = numericCell(row[yColumn]);
    if (x === null || y === null) invalid.push(i + 1);
    else points.push({ row: i + 1, x, y });
  });
  return { points, invalid };
}
function leastSquares(xs: number[], ys: number[], degree: number) {
  const center = describe(xs).mean,
    scale = Math.max(...xs.map((x) => Math.abs(x - center)));
  if (!scale || !Number.isFinite(scale))
    throw new Error("X 数据没有足够的变化，无法拟合。");
  const t = xs.map((x) => (x - center) / scale),
    q: number[][] = [],
    r = Array.from({ length: degree + 1 }, () => Array(degree + 1).fill(0));
  for (let j = 0; j <= degree; j++) {
    const v = t.map((x) => x ** j);
    // Reorthogonalized QR, with centered/scaled X to avoid normal-equation instability.
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < j; i++) {
        const dot = total(v.map((x, k) => x * q[i][k]));
        r[i][j] += dot;
        for (let k = 0; k < v.length; k++) v[k] -= dot * q[i][k];
      }
    const norm = Math.sqrt(total(v.map((x) => x * x)));
    if (norm < 1e-11 * Math.sqrt(xs.length))
      throw new Error("数据矩阵秩不足，请增加不同的 X 值或降低阶数。");
    r[j][j] = norm;
    q.push(v.map((x) => x / norm));
  }
  const c = Array(degree + 1).fill(0),
    rhs = q.map((col) => total(col.map((x, i) => x * ys[i])));
  for (let i = degree; i >= 0; i--)
    c[i] =
      (rhs[i] - total(c.slice(i + 1).map((v, j) => v * r[i][i + j + 1]))) /
      r[i][i];
  return { center, scale, normalized: c as number[] };
}
const horner = (c: number[], x: number) =>
  c.reduceRight((value, a) => value * x + a, 0);
function expand(c: number[], center: number, scale: number) {
  const out = c.map(() => 0);
  const choose = (n: number, k: number) => {
    let v = 1;
    for (let j = 1; j <= k; j++) v = (v * (n - j + 1)) / j;
    return v;
  };
  for (let j = 0; j < c.length; j++)
    for (let k = 0; k <= j; k++)
      out[k] += (c[j] * choose(j, k) * (-center) ** (j - k)) / scale ** j;
  return out;
}
export const precision = (value: number) =>
  Number.isFinite(value) ? String(Object.is(value, -0) ? 0 : value) : "未定义";
export function evaluateFit(
  fit: Pick<FitResult, "model" | "center" | "scale" | "normalized">,
  x: number,
) {
  const transformed =
    fit.model === "logarithmic" || fit.model === "power" ? Math.log(x) : x;
  const y = horner(fit.normalized, (transformed - fit.center) / fit.scale);
  return fit.model === "exponential" || fit.model === "power" ? Math.exp(y) : y;
}
export function fitCurve(points: DataPoint[], model: FitModel): FitResult {
  if (
    ![
      "linear",
      "poly2",
      "poly3",
      "poly4",
      "exponential",
      "logarithmic",
      "power",
    ].includes(model)
  )
    throw new Error("拟合模型无效。");
  const degree = model.startsWith("poly") ? Number(model.slice(-1)) : 1;
  if (
    points.length < degree + 1 ||
    points.length > 10000 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw new Error(`需要 ${degree + 1}–10,000 个有效数据点。`);
  if (
    (model === "logarithmic" || model === "power") &&
    points.some((p) => p.x <= 0)
  )
    throw new Error("对数 / 幂律拟合要求所有启用点的 X > 0。");
  if (
    (model === "exponential" || model === "power") &&
    points.some((p) => p.y <= 0)
  )
    throw new Error("指数 / 幂律拟合要求所有启用点的 Y > 0。");
  const logX = model === "logarithmic" || model === "power",
    logY = model === "exponential" || model === "power",
    xs = points.map((p) => (logX ? Math.log(p.x) : p.x)),
    ys = points.map((p) => (logY ? Math.log(p.y) : p.y)),
    solution = leastSquares(xs, ys, degree),
    coefficients = expand(solution.normalized, solution.center, solution.scale),
    result = { model, ...solution };
  const predicted = points.map((p) => evaluateFit(result, p.x));
  if (predicted.some((y) => !Number.isFinite(y)))
    throw new Error("拟合结果超出数值范围。");
  const xStats = describe(points.map((p) => p.x)),
    yStats = describe(points.map((p) => p.y)),
    sse = total(predicted.map((y, i) => (y - points[i].y) ** 2)),
    sst = total(points.map((p) => (p.y - yStats.mean) ** 2)),
    r2 = sst === 0 ? null : 1 - sse / sst;
  const expression = solution.normalized
    .map(
      (c, i) =>
        `${i ? " + " : ""}(${precision(c)})${
          i ? `·t${i > 1 ? "^" + i : ""}` : ""
        }`,
    )
    .join("");
  if (
    ![sse, sst, xStats.mean, yStats.mean, ...coefficients].every(
      Number.isFinite,
    )
  )
    throw new Error("数据超出双精度数值范围，请调整单位或缩放数据。");
  const equation = `y = ${logY ? "exp(" : ""}${expression}${
    logY ? ")" : ""
  }; t = (${logX ? "ln(x)" : "x"} − (${precision(
    solution.center,
  )})) / ${precision(solution.scale)}`;
  return {
    ...result,
    n: points.length,
    degree,
    coefficients,
    r2,
    sse,
    equation,
    objective: logY
      ? "对 ln(Y) 做最小二乘；R² 在原始 Y 尺度计算。"
      : "对原始 Y 做最小二乘。",
    xStats,
    yStats,
  };
}
export function fitReport(
  fit: FitResult,
  fileName: string,
  excluded: number[] = [],
) {
  return `实验数据拟合结果（浏览器数值计算，IEEE 754 双精度）\n来源：${fileName}\n模型：${
    fit.model
  }；有效点数 n=${fit.n}；手动排除行：${excluded.join(", ") || "无"}\n${
    fit.equation
  }\nR² = ${
    fit.r2 === null ? "未定义（Y 无变异）" : precision(fit.r2)
  }\nSSE = ${precision(fit.sse)}\nY 均值 = ${precision(
    fit.yStats.mean,
  )}；样本 SD = ${
    fit.yStats.sd === null ? "未定义" : precision(fit.yStats.sd)
  }；RSD = ${
    fit.yStats.rsd === null ? "未定义" : precision(fit.yStats.rsd) + "%"
  }\n${
    fit.objective
  }\n请基于这些确定的计算值讨论实验意义和限制，不改写或猜测系数。`;
}
export async function inspectLabFile(file: File): Promise<LabData> {
  if (typeof window === "undefined")
    throw new Error("请在浏览器中读取实验数据。");
  if (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 10 * 1024 * 1024)
    throw new Error("请选择不超过 10 MB 的 CSV / XLSX。");
  const XLSX = await import("xlsx"),
    book = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      sheetRows: 10002,
      cellFormula: true,
      cellDates: false,
    });
  if (book.SheetNames.length > 20) throw new Error("最多支持 20 个工作表。");
  return {
    name: file.name,
    sheets: book.SheetNames.map((name) => {
      const sheet = book.Sheets[name];
      const bounds = XLSX.utils.decode_range(
        sheet["!fullref"] || sheet["!ref"] || "A1",
      );
      if (bounds.e.r >= 10001 || bounds.e.c >= 64)
        throw new Error("每张表最多 10,000 条数据、64 列。");
      const rows = XLSX.utils.sheet_to_json<
        (string | number | boolean | null)[]
      >(sheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
        range: 0,
      });
      if (rows.length > 10001 || rows.some((row) => row.length > 64))
        throw new Error("每张表最多 10,000 条数据、64 列。");
      return {
        name,
        rows,
        formulas: Object.keys(sheet).filter(
          (key) => !key.startsWith("!") && sheet[key]?.f,
        ).length,
      };
    }),
  };
}
