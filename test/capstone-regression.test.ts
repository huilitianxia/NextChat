import {
  describe as stats,
  evaluateFit,
  fitCurve,
  fitReport,
  numericCell,
  pointsFromRows,
  FitModel,
} from "../app/utils/curve-fitter";
const points = (xs: number[], fn: (x: number) => number) =>
  xs.map((x, i) => ({ row: i + 2, x, y: fn(x) }));
test("descriptive statistics use sample SD and absolute mean RSD", () => {
  expect(stats([1, 2, 3])).toMatchObject({
    mean: 2,
    sd: 1,
    rsd: 50,
    min: 1,
    max: 3,
    n: 3,
  });
  expect(stats([-1, -2, -3]).rsd).toBe(50);
  expect(stats([-1, 1]).rsd).toBeNull();
  expect(stats([8]).sd).toBeNull();
});
test.each([[], [1, Infinity], [NaN]].map((values) => ({ values })))(
  "invalid descriptive data rejected %p",
  ({ values }) => expect(() => stats(values)).toThrow(),
);
test.each(["", "  ", "2mg", "1,000", "0x10", true, null, Infinity, "1e999"])(
  "non-numeric cell is missing, not zero: %p",
  (value) => expect(numericCell(value)).toBeNull(),
);
test.each([
  [" 1.25 ", 1.25],
  ["-.5", -0.5],
  ["2e-3", 0.002],
  [0, 0],
])("numeric cell %p", (value, expected) =>
  expect(numericCell(value)).toBe(expected),
);
test("header, blanks and explicit Excel row indices retained", () => {
  const r = pointsFromRows(
    [
      ["x", "y"],
      [1, 3],
      [null, 4],
      ["2", "5"],
    ],
    0,
    1,
  );
  expect(r.points).toEqual([
    { row: 2, x: 1, y: 3 },
    { row: 4, x: 2, y: 5 },
  ]);
  expect(r.invalid).toEqual([3]);
  expect(pointsFromRows([[1, 3]], 0, 1, false).points).toHaveLength(1);
});
test.each([
  ["linear", (x: number) => 2 + 3 * x],
  ["poly2", (x: number) => 1 - 2 * x + 3 * x * x],
  ["poly3", (x: number) => 3 + 2 * x - x * x + 0.5 * x ** 3],
  ["poly4", (x: number) => 1 + x + x * x - x ** 3 + 0.1 * x ** 4],
  ["exponential", (x: number) => 3 * Math.exp(0.2 * x)],
  ["logarithmic", (x: number) => 2 + 3 * Math.log(x)],
  ["power", (x: number) => 5 * x ** 1.8],
] as [FitModel, (x: number) => number][])(
  "%s recovers a known equation at observed and held-out points",
  (model, fn) => {
    const fit = fitCurve(points([1, 2, 3, 4, 5, 6, 7], fn), model);
    expect(fit.r2).toBeCloseTo(1, 10);
    for (const x of [1.5, 3.5, 6.5])
      expect(evaluateFit(fit, x)).toBeCloseTo(fn(x), 8);
    expect(fitReport(fit, "lab.csv", [3])).toContain(fit.equation);
  },
);
test("linear coefficients and independently calculated noisy R2", () => {
  const fit = fitCurve(
    [
      { row: 1, x: 1, y: 1 },
      { row: 2, x: 2, y: 2 },
      { row: 3, x: 3, y: 2 },
    ],
    "linear",
  );
  expect(fit.coefficients[0]).toBeCloseTo(2 / 3, 10);
  expect(fit.coefficients[1]).toBeCloseTo(0.5, 10);
  expect(fit.sse).toBeCloseTo(1 / 6, 10);
  expect(fit.r2).toBeCloseTo(0.75, 10);
});
test("centered QR handles large X offsets without losing predictions", () => {
  const f = (x: number) => 7 + 3 * (x - 1e9) + 0.5 * (x - 1e9) ** 2,
    fit = fitCurve(points([1e9, 1e9 + 1, 1e9 + 2, 1e9 + 3], f), "poly2");
  expect(evaluateFit(fit, 1e9 + 1.5)).toBeCloseTo(f(1e9 + 1.5), 8);
});
test("constant Y yields undefined R2, not a made-up perfect score", () =>
  expect(
    fitCurve(
      points([1, 2, 3], () => 5),
      "linear",
    ).r2,
  ).toBeNull());
test.each(["logarithmic", "power"] as FitModel[])(
  "%s rejects non-positive X",
  (model) =>
    expect(() =>
      fitCurve(
        points([0, 1, 2], (x) => x + 1),
        model,
      ),
    ).toThrow(/X/),
);
test.each(["exponential", "power"] as FitModel[])(
  "%s rejects non-positive Y",
  (model) =>
    expect(() =>
      fitCurve(
        points([1, 2, 3], (x) => x - 2),
        model,
      ),
    ).toThrow(/Y/),
);
test("under-determined, duplicate-X and nonfinite data fail explicitly", () => {
  expect(() =>
    fitCurve(
      points([1, 2], (x) => x),
      "poly2",
    ),
  ).toThrow();
  expect(() =>
    fitCurve(
      points([1, 1, 2, 2], (x) => x),
      "poly3",
    ),
  ).toThrow(/秩/);
  expect(() =>
    fitCurve(
      points([1, 1], (x) => x),
      "linear",
    ),
  ).toThrow();
  expect(() =>
    fitCurve(
      points([1, Infinity], (x) => x),
      "linear",
    ),
  ).toThrow();
});
test("removing a user-selected outlier changes the fit without mutating source", () => {
  const source = points([0, 1, 2, 3], (x) => 2 * x + 1);
  source.push({ row: 9, x: 4, y: 100 });
  const all = fitCurve(source, "linear"),
    clean = fitCurve(
      source.filter((p) => p.row !== 9),
      "linear",
    );
  expect(clean.coefficients[1]).toBeCloseTo(2);
  expect(all.coefficients[1]).toBeGreaterThan(10);
  expect(source).toHaveLength(5);
});
