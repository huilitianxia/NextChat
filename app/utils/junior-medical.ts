import { positive, range, finite, Point, boundedResult } from "./junior-common";
export type PKInput = {
  target: number;
  vd: number;
  clearance: number;
  availability: number;
  interval: number;
  dose: number;
  intervals: number;
  loading: boolean;
};
export const PK_EXAMPLE: PKInput = {
  target: 10,
  vd: 40,
  clearance: 4,
  availability: 1,
  interval: 8,
  dose: 320,
  intervals: 6,
  loading: true,
};
export function pharmacokinetics(p: PKInput) {
  positive(p.target, p.vd, p.clearance, p.availability, p.interval, p.dose);
  range(p.availability, Number.MIN_VALUE, 1, "生物利用度");
  range(p.intervals, 1, 24, "给药间隔数");
  if (!Number.isInteger(p.intervals)) throw new Error("间隔数须为整数。");
  const ke = p.clearance / p.vd,
    loadingDose = (p.target * p.vd) / p.availability,
    maintenanceDose = (p.target * p.clearance * p.interval) / p.availability,
    decay = Math.exp(-ke * p.interval),
    peak = (p.availability * p.dose) / p.vd / -Math.expm1(-ke * p.interval);
  const values = boundedResult({
    ke,
    halfLife: Math.LN2 / ke,
    loadingDose,
    maintenanceDose,
    cssAverage: (p.availability * p.dose) / (p.clearance * p.interval),
    cssPeak: peak,
    cssTrough: peak * decay,
  });
  const points: Point[] = [{ x: 0, y: 0 }];
  let concentration = 0;
  for (let interval = 0; interval < p.intervals; interval++) {
    concentration +=
      (p.availability * (interval === 0 && p.loading ? loadingDose : p.dose)) /
      p.vd;
    points.push({ x: interval * p.interval, y: concentration });
    for (let i = 1; i <= 40; i++)
      points.push({
        x: (interval + i / 40) * p.interval,
        y: concentration * Math.exp((-ke * p.interval * i) / 40),
      });
    concentration *= decay;
  }
  return { ...values, points };
}
export function creatinineClearance(
  age: number,
  weight: number,
  scr: number,
  female: boolean,
  unit: "mg/dL" | "µmol/L" = "mg/dL",
) {
  range(age, 18, 139, "成人年龄");
  positive(weight, scr);
  if (!["mg/dL", "µmol/L"].includes(unit)) throw new Error("肌酐单位无效。");
  const mgDl = unit === "µmol/L" ? scr / 88.4 : scr;
  return boundedResult({
    mgDl,
    crcl: (((140 - age) * weight) / (72 * mgDl)) * (female ? 0.85 : 1),
  });
}
export function acidBase(
  na: number,
  cl: number,
  hco3: number,
  pco2: number,
  albumin: number,
  potassium = 0,
  metabolicAcidosis = true,
) {
  positive(na, cl, hco3, pco2, albumin);
  range(potassium, 0, 20, "钾浓度");
  finite(na, cl, hco3, pco2, albumin);
  const ag = na + potassium - cl - hco3,
    expected = 1.5 * hco3 + 8,
    low = expected - 2,
    high = expected + 2;
  return {
    ...boundedResult({
      ag,
      correctedAG: ag + 2.5 * (4 - albumin),
      expected,
      low,
      high,
    }),
    interpretation: !metabolicAcidosis
      ? "未确认代谢性酸中毒：不解释 Winter 代偿范围"
      : pco2 < low
      ? "PaCO₂ 低于预期代偿范围，需评估合并呼吸性碱化因素"
      : pco2 > high
      ? "PaCO₂ 高于预期代偿范围，需评估合并呼吸性酸化因素"
      : "PaCO₂ 位于 Winter 预期代偿范围",
  };
}
