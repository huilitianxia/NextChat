import { positive, range, finite, boundedResult, Point } from "./junior-common";
export const GAS_R = 8.31446261815324,
  FARADAY = 96485.33212;
export function nernst(
  e0: number,
  temperature: number,
  electrons: number,
  reduced: number,
  oxidized: number,
) {
  finite(e0);
  positive(temperature, electrons, reduced, oxidized);
  if (!Number.isInteger(electrons)) throw new Error("电子数须为正整数。");
  const logQ = Math.log(reduced) - Math.log(oxidized);
  return boundedResult({
    potential: e0 - ((GAS_R * temperature) / (electrons * FARADAY)) * logQ,
    quotient: reduced / oxidized,
  });
}
export type BufferInput = {
  mode: "acid" | "base";
  pK: number;
  pH: number;
  total: number;
  volumeMl: number;
  acidMw: number;
  baseMw: number;
  acidStock: number;
  baseStock: number;
};
export const BUFFER_EXAMPLE: BufferInput = {
  mode: "acid",
  pK: 4.76,
  pH: 4.76,
  total: 0.1,
  volumeMl: 250,
  acidMw: 60.052,
  baseMw: 82.034,
  acidStock: 1,
  baseStock: 1,
};
export function bufferRecipe(p: BufferInput) {
  range(p.pK, 0, 14, "pK");
  range(p.pH, 0, 14, "pH");
  positive(p.total, p.volumeMl, p.acidMw, p.baseMw, p.acidStock, p.baseStock);
  const pKa = p.mode === "acid" ? p.pK : 14 - p.pK,
    ratio = 10 ** (p.pH - pKa),
    acidMoles = (p.total * p.volumeMl) / 1000 / (1 + ratio),
    baseMoles = acidMoles * ratio,
    acidMl = (acidMoles / p.acidStock) * 1000,
    baseMl = (baseMoles / p.baseStock) * 1000;
  if (acidMl + baseMl > p.volumeMl + 1e-8)
    throw new Error(
      "两种储备液总体积超过定容体积，请提高储备液浓度或降低目标浓度。",
    );
  return {
    ...boundedResult({
      pKa,
      ratio,
      acidMoles,
      baseMoles,
      acidMass: acidMoles * p.acidMw,
      baseMass: baseMoles * p.baseMw,
      acidMl,
      baseMl,
      solventMl: p.volumeMl - acidMl - baseMl,
    }),
    inBufferRange: Math.abs(p.pH - pKa) <= 1,
  };
}
export type TitrationInput = {
  mode: "acid" | "base";
  pK: number;
  concentration: number;
  volumeMl: number;
  titrant: number;
};
export function titrationPH(p: TitrationInput, addedMl: number) {
  range(p.pK, 0, 14, "pK");
  positive(p.concentration, p.volumeMl, p.titrant);
  range(addedMl, 0, 1e6, "滴定体积");
  const totalVolume = (p.volumeMl + addedMl) / 1000,
    total = (p.concentration * p.volumeMl) / 1000 / totalVolume,
    salt = (p.titrant * addedMl) / 1000 / totalVolume,
    kw = 1e-14,
    ka = p.mode === "acid" ? 10 ** -p.pK : kw / 10 ** -p.pK;
  const residual = (logH: number) => {
    const h = 10 ** logH;
    return p.mode === "acid"
      ? h + salt - kw / h - (total * ka) / (ka + h)
      : h + (total * h) / (h + ka) - kw / h - salt;
  };
  let lo = -18,
    hi = 3;
  if (residual(lo) > 0 || residual(hi) < 0)
    throw new Error("超出理想水溶液求解范围。");
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (residual(mid) > 0) hi = mid;
    else lo = mid;
  }
  return -(lo + hi) / 2;
}
export function titrationCurve(p: TitrationInput) {
  const equivalenceMl = (p.concentration * p.volumeMl) / p.titrant;
  positive(equivalenceMl);
  const points: Point[] = Array.from({ length: 201 }, (_, i) => {
    const x = (equivalenceMl * i) / 100;
    return { x, y: titrationPH(p, x) };
  });
  return {
    equivalenceMl,
    equivalencePH: titrationPH(p, equivalenceMl),
    halfPH: titrationPH(p, equivalenceMl / 2),
    bufferStart: equivalenceMl / 11,
    bufferEnd: (equivalenceMl * 10) / 11,
    points,
  };
}
export function arrhenius(
  t1: number,
  k1: number,
  t2: number,
  k2: number,
  targetT: number,
) {
  positive(t1, k1, t2, k2, targetT);
  if (Math.abs(1 / t1 - 1 / t2) < 1e-12) throw new Error("两组温度必须不同。");
  const activation =
      (GAS_R * (Math.log(k2) - Math.log(k1))) / (1 / t1 - 1 / t2),
    logA = Math.log(k1) + activation / (GAS_R * t1),
    predicted = Math.exp(logA - activation / (GAS_R * targetT));
  return boundedResult({ activationKj: activation / 1000, logA, predicted });
}
export function beerLambert(
  epsilon: number,
  pathCm: number,
  concentration: number,
  measuredA: number,
) {
  positive(epsilon, pathCm);
  range(concentration, 0, 1e6, "浓度");
  range(measuredA, 0, 1000, "吸光度");
  const absorbance = epsilon * pathCm * concentration;
  return boundedResult({
    absorbance,
    transmissionPercent: 100 * 10 ** -absorbance,
    inferredConcentration: measuredA / (epsilon * pathCm),
  });
}
