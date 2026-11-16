import {
  nernst,
  bufferRecipe,
  BUFFER_EXAMPLE,
  titrationPH,
  titrationCurve,
  arrhenius,
  beerLambert,
} from "../app/utils/junior-chemistry";
test("Nernst iron pair and equilibrium have expected sign and temperature dependence", () => {
  expect(nernst(0.771, 298.15, 1, 0.01, 0.1).potential).toBeCloseTo(
    0.83015935,
    7,
  );
  expect(nernst(0.771, 600, 1, 1, 1).potential).toBe(0.771);
  expect(nernst(0.771, 596.3, 2, 0.01, 0.1).potential).toBeCloseTo(
    0.83015935,
    7,
  );
});
test.each([
  [0, 1, 1, 1],
  [298, 0, 1, 1],
  [298, 1.5, 1, 1],
  [298, 1, 0, 1],
  [298, 1, 1, -1],
])("invalid electrochemistry inputs %p", (t, n, r, o) =>
  expect(() => nernst(0.5, t, n, r, o)).toThrow(),
);
test("equal acetate buffer conserves total moles and gives alternative stock recipe", () => {
  const b = bufferRecipe(BUFFER_EXAMPLE);
  expect(b.ratio).toBe(1);
  expect(b.acidMoles).toBe(0.0125);
  expect(b.baseMoles).toBe(0.0125);
  expect(b.acidMass).toBeCloseTo(0.75065, 7);
  expect(b.baseMass).toBeCloseTo(1.025425, 7);
  expect(b.acidMl).toBe(12.5);
  expect(b.solventMl).toBe(225);
  expect(b.inBufferRange).toBe(true);
});
test("conjugate-acid pKa from pKb and distant targets", () => {
  const p = bufferRecipe({
    ...BUFFER_EXAMPLE,
    mode: "base",
    pK: 4.75,
    pH: 9.25,
  });
  expect(p.pKa).toBe(9.25);
  expect(p.ratio).toBe(1);
  expect(bufferRecipe({ ...BUFFER_EXAMPLE, pH: 7 }).inBufferRange).toBe(false);
});
test.each([
  { acidStock: 0.001 },
  { pH: 15 },
  { total: 0 },
  { volumeMl: 0 },
  { baseMw: NaN },
])("invalid buffer recipes %p", (bad) =>
  expect(() => bufferRecipe({ ...BUFFER_EXAMPLE, ...bad })).toThrow(),
);
const acid = {
  mode: "acid" as const,
  pK: 4.76,
  concentration: 0.1,
  volumeMl: 25,
  titrant: 0.1,
};
test("monoprotic charge-balance titration covers initial, buffer, equivalence and excess base", () => {
  const curve = titrationCurve(acid);
  expect(curve.equivalenceMl).toBe(25);
  expect(titrationPH(acid, 0)).toBeCloseTo(2.8829, 3);
  expect(curve.halfPH).toBeCloseTo(4.76, 2);
  expect(curve.equivalencePH).toBeCloseTo(8.7295, 3);
  expect(titrationPH(acid, 50)).toBeCloseTo(12.5229, 3);
  expect(curve.points).toHaveLength(201);
  expect(curve.points.every((p, i, a) => !i || p.y >= a[i - 1].y)).toBe(true);
});
test("weak-base titration mirrors acid under identical pK and analytical conditions", () => {
  for (const added of [0, 5, 12.5, 25, 50])
    expect(
      titrationPH({ ...acid, mode: "base" }, added) + titrationPH(acid, added),
    ).toBeCloseTo(14, 8);
});
test("charge solver includes water at extreme dilution", () => {
  expect(titrationPH({ ...acid, concentration: 1e-10 }, 0)).toBeCloseTo(7, 2);
  expect(() => titrationPH(acid, -1)).toThrow();
  expect(() => titrationCurve({ ...acid, titrant: 0 })).toThrow();
});
test("two-point Arrhenius uses reciprocal absolute temperatures", () => {
  const p = arrhenius(300, 1, 600, Math.E, 450);
  expect(p.activationKj).toBeCloseTo(4.988677571, 8);
  expect(p.predicted).toBeCloseTo(Math.exp(2 / 3), 9);
  expect(arrhenius(300, Math.E, 600, 1, 450).activationKj).toBeLessThan(0);
});
test.each([
  [300, 1, 300, 2, 400],
  [0, 1, 400, 2, 350],
  [300, 0, 400, 2, 350],
])("invalid Arrhenius setup %p", (a, b, c, d, e) =>
  expect(() => arrhenius(a, b, c, d, e)).toThrow(),
);
test("Beer-Lambert forward and inverse with path length and percent transmittance", () => {
  const p = beerLambert(15000, 1, 0.00002, 0.3);
  expect(p.absorbance).toBeCloseTo(0.3);
  expect(p.transmissionPercent).toBeCloseTo(50.11872336, 7);
  expect(p.inferredConcentration).toBeCloseTo(0.00002, 12);
  expect(beerLambert(1, 1, 0, 0).transmissionPercent).toBe(100);
  expect(() => beerLambert(1, 0, 1, 1)).toThrow();
  expect(() => beerLambert(1, 1, -1, 1)).toThrow();
});
