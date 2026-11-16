import {
  pharmacokinetics,
  PK_EXAMPLE,
  creatinineClearance,
  acidBase,
} from "../app/utils/junior-medical";
test("one-compartment teaching example retains dimensional dose and steady-state values", () => {
  const p = pharmacokinetics(PK_EXAMPLE);
  expect(p.loadingDose).toBe(400);
  expect(p.maintenanceDose).toBe(320);
  expect(p.ke).toBe(0.1);
  expect(p.halfLife).toBeCloseTo(6.9314718056, 9);
  expect(p.cssAverage).toBe(10);
  expect(p.cssPeak - p.cssTrough).toBeCloseTo(8, 10);
  expect(p.points[0]).toEqual({ x: 0, y: 0 });
  expect(p.points[1]).toEqual({ x: 0, y: 10 });
  expect(p.points.at(-1)!.x).toBe(48);
});
test("dose discontinuities preserve the trough and subsequent bolus at the same time", () => {
  const p = pharmacokinetics(PK_EXAMPLE),
    at8 = p.points.filter((p) => p.x === 8);
  expect(at8).toHaveLength(2);
  expect(at8[0].y).toBeCloseTo(4.493289641, 8);
  expect(at8[1].y - at8[0].y).toBeCloseTo(8, 10);
});
test("bioavailability and loading switch are applied independently", () => {
  const p = pharmacokinetics({
    ...PK_EXAMPLE,
    availability: 0.5,
    loading: false,
  });
  expect(p.loadingDose).toBe(800);
  expect(p.maintenanceDose).toBe(640);
  expect(p.cssAverage).toBe(5);
  expect(p.points[1].y).toBe(4);
});
test.each([
  { vd: 0 },
  { availability: 1.1 },
  { clearance: -1 },
  { target: NaN },
  { interval: 0 },
  { dose: Infinity },
  { intervals: 0 },
  { intervals: 2.5 },
  { intervals: 25 },
])("PK rejects impossible inputs %p", (bad) =>
  expect(() => pharmacokinetics({ ...PK_EXAMPLE, ...bad })).toThrow(),
);
test("adult CG correctly converts micromoles and sex coefficient", () => {
  expect(creatinineClearance(60, 72, 1, false).crcl).toBe(80);
  expect(creatinineClearance(60, 72, 88.4, true, "µmol/L").crcl).toBe(68);
});
test.each([
  [17, 70, 1],
  [140, 70, 1],
  [70, 0, 1],
  [70, 70, 0],
  [NaN, 70, 1],
])("CG rejects invalid or pediatric input %p", (a, w, c) =>
  expect(() => creatinineClearance(a, w, c, false)).toThrow(),
);
test("AG, albumin correction and Winter intervals do not conflate interpretation", () => {
  const p = acidBase(140, 104, 16, 32, 3);
  expect(p).toMatchObject({
    ag: 20,
    correctedAG: 22.5,
    expected: 32,
    low: 30,
    high: 34,
  });
  expect(p.interpretation).toContain("位于");
  expect(acidBase(140, 104, 16, 29, 3).interpretation).toContain("低于");
  expect(acidBase(140, 104, 16, 35, 3).interpretation).toContain("高于");
  expect(acidBase(140, 104, 16, 50, 3, 4, false)).toMatchObject({
    ag: 24,
    correctedAG: 26.5,
  });
  expect(acidBase(140, 104, 16, 50, 3, 0, false).interpretation).toContain(
    "未确认",
  );
});
test.each([0, -2, NaN, Infinity])("invalid bicarbonate rejected %p", (n) =>
  expect(() => acidBase(140, 104, n, 32, 3)).toThrow(),
);
