import {
  secondOrderStep,
  settlingTime,
  controlSystem,
  converter,
  powerFactorCorrection,
} from "../app/utils/junior-electrical";
test("canonical second-order responses include initial, critical, under and over damping", () => {
  for (const z of [0, 0.5, 1, 2, 10])
    expect(secondOrderStep(5, z, 0)).toBeCloseTo(0, 10);
  expect(secondOrderStep(1, 1, 1)).toBeCloseTo(0.26424111766, 10);
  expect(secondOrderStep(1, 0, Math.PI)).toBeCloseTo(2, 10);
  expect(secondOrderStep(5, 2, 30)).toBeCloseTo(1, 10);
});
test("underdamped metrics use rad/s rather than Hz", () => {
  const p = controlSystem(5, 0.5);
  expect(p.overshoot).toBeCloseTo(16.30335348, 7);
  expect(p.peakTime).toBeCloseTo(0.7255197457, 9);
  expect(p.resonantPeak).toBeCloseTo(1.154700538, 8);
  expect(p.resonantOmega).toBeCloseTo(3.535533906, 8);
  expect(p.ts2).toBeGreaterThan(p.ts5!);
  expect(p.bode[120].x).toBeCloseTo(Math.log10(5 / (2 * Math.PI)), 10);
  expect(p.bode[120].y).toBeCloseTo(0, 10);
});
test.each([0.05, 0.3, 0.5, 0.8, 0.99, 1, 1.001, 2, 10])(
  "settling time is last error-band crossing for zeta %p",
  (z) => {
    for (const tolerance of [0.02, 0.05] as const) {
      const t = settlingTime(2, z, tolerance)!;
      expect(Math.abs(secondOrderStep(2, z, t) - 1)).toBeCloseTo(tolerance, 8);
      expect(
        Math.abs(secondOrderStep(2, z, t * (1 - 1e-5)) - 1),
      ).toBeGreaterThan(tolerance);
      for (let i = 1; i < 120; i++)
        expect(
          Math.abs(secondOrderStep(2, z, t + (i * (t + 1)) / 100) - 1),
        ).toBeLessThanOrEqual(tolerance + 1e-7);
    }
  },
);
test("undamped system has no settling and infinite resonance; critical has no overshoot", () => {
  expect(controlSystem(2, 0)).toMatchObject({
    ts2: null,
    ts5: null,
    resonantPeak: null,
    overshoot: 100,
  });
  expect(controlSystem(1, 1)).toMatchObject({
    peakTime: null,
    overshoot: 0,
    resonantPeak: 1,
  });
  expect(settlingTime(1, 1, 0.02)).toBeCloseTo(5.8339217, 6);
});
test.each([
  [0, 0.5],
  [1, -1],
  [1, NaN],
  [Infinity, 1],
])("invalid control parameters %p", (w, z) =>
  expect(() => controlSystem(w, z)).toThrow(),
);
test("Buck sizing differentiates CCM boundary and target ripple", () => {
  const p = converter("buck", 24, 12, 2, 100000, 0.3, 0.05);
  expect(p.duty).toBe(0.5);
  expect(p.inductance).toBeCloseTo(0.0001, 12);
  expect(p.criticalInductance).toBeCloseTo(0.000015, 12);
  expect(p.capacitance).toBeCloseTo(0.000015, 12);
  expect(p.peakCurrent).toBe(2.3);
});
test("Boost uses inductor input current and output discharge duty", () => {
  const p = converter("boost", 12, 24, 2, 100000, 0.3, 0.1);
  expect(p.duty).toBe(0.5);
  expect(p.inductorCurrent).toBe(4);
  expect(p.inductance).toBeCloseTo(0.00005, 12);
  expect(p.criticalInductance).toBeCloseTo(0.0000075, 12);
  expect(p.capacitance).toBeCloseTo(0.0001, 12);
});
test("converter impossible direction and discontinuous-region ripple rejected", () => {
  expect(() => converter("buck", 12, 24, 1, 10000, 0.3, 0.1)).toThrow();
  expect(() => converter("boost", 24, 12, 1, 10000, 0.3, 0.1)).toThrow();
  expect(() => converter("buck", 24, 12, 1, 10000, 2, 0.1)).toThrow();
});
test("three phase star capacitance is triple delta, zero correction at unchanged PF", () => {
  const star = powerFactorCorrection(10000, 400, 50, 0.8, 1, "star"),
    delta = powerFactorCorrection(10000, 400, 50, 0.8, 1, "delta");
  expect(star.reactive).toBeCloseTo(7500, 8);
  expect(star.perPhase).toBeCloseTo(delta.perPhase * 3, 12);
  expect(star.currentAfter).toBeLessThan(star.currentBefore);
  expect(
    powerFactorCorrection(10000, 400, 50, 0.8, 0.8, "delta").perPhase,
  ).toBe(0);
  expect(() =>
    powerFactorCorrection(10000, 400, 50, 0.95, 0.8, "star"),
  ).toThrow();
});
