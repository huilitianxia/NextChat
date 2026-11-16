import { positive, range, boundedResult } from "./junior-common";
export function secondOrderStep(wn: number, zeta: number, time: number) {
  positive(wn);
  range(zeta, 0, 100, "阻尼比");
  range(time, 0, 1e12, "时间");
  const x = wn * time;
  if (zeta < 1) {
    const s = Math.sqrt(1 - zeta * zeta);
    return (
      1 - Math.exp(-zeta * x) * (Math.cos(s * x) + (zeta / s) * Math.sin(s * x))
    );
  }
  if (zeta === 1) return 1 - (1 + x) * Math.exp(-x);
  const a = zeta + Math.sqrt(zeta * zeta - 1),
    r1 = -wn / a,
    r2 = -wn * a;
  return 1 + (r2 * Math.exp(r1 * time) - r1 * Math.exp(r2 * time)) / (r1 - r2);
}
export function settlingTime(wn: number, zeta: number, tolerance: 0.02 | 0.05) {
  positive(wn);
  range(zeta, 0, 100, "阻尼比");
  if (![0.02, 0.05].includes(tolerance))
    throw new Error("调节带仅支持 2% 或 5%。");
  if (zeta === 0) return null;
  let lo = 0,
    hi: number;
  if (zeta < 1) {
    const s = Math.sqrt(1 - zeta * zeta),
      wd = wn * s,
      m = Math.max(
        0,
        Math.ceil((Math.log(1 / tolerance) * s) / (Math.PI * zeta)) - 1,
      );
    lo = (m * Math.PI) / wd;
    hi = ((m + 1) * Math.PI) / wd;
  } else {
    hi = 1 / wn;
    while (Math.abs(secondOrderStep(wn, zeta, hi) - 1) > tolerance) hi *= 2;
  }
  for (let i = 0; i < 85; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(secondOrderStep(wn, zeta, mid) - 1) > tolerance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function controlSystem(wn: number, zeta: number) {
  positive(wn);
  range(zeta, 0, 100, "阻尼比");
  const under = zeta < 1,
    wd = wn * Math.sqrt(Math.max(0, 1 - zeta * zeta)),
    ts2 = settlingTime(wn, zeta, 0.02),
    ts5 = settlingTime(wn, zeta, 0.05),
    duration = Math.max(8 / wn, (ts2 || 20 / wn) * 1.2),
    points = Array.from({ length: 801 }, (_, i) => ({
      x: (duration * i) / 800,
      y: secondOrderStep(wn, zeta, (duration * i) / 800),
    }));
  const bode = Array.from({ length: 241 }, (_, i) => {
    const ratio = 10 ** (-2 + (4 * i) / 240),
      den = Math.hypot(1 - ratio * ratio, 2 * zeta * ratio),
      db = -20 * Math.log10(den);
    return {
      x: Math.log10((wn * ratio) / (2 * Math.PI)),
      y: Math.max(-100, Math.min(80, db)),
    };
  });
  return {
    overshoot: under
      ? 100 * Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta))
      : 0,
    peakTime: under ? Math.PI / wd : null,
    ts2,
    ts5,
    resonantPeak:
      zeta === 0
        ? null
        : zeta < Math.SQRT1_2
        ? 1 / (2 * zeta * Math.sqrt(1 - zeta * zeta))
        : 1,
    resonantOmega:
      zeta < Math.SQRT1_2 ? wn * Math.sqrt(1 - 2 * zeta * zeta) : 0,
    points,
    bode,
  };
}
export function converter(
  mode: "buck" | "boost",
  vin: number,
  vout: number,
  current: number,
  frequency: number,
  rippleFraction: number,
  voltageRipple: number,
) {
  positive(vin, vout, current, frequency, rippleFraction, voltageRipple);
  if (!["buck", "boost"].includes(mode)) throw new Error("变换器类型无效。");
  if (mode === "buck" ? vout >= vin : vout <= vin)
    throw new Error(
      mode === "buck"
        ? "Buck 要求输出电压低于输入。"
        : "Boost 要求输出电压高于输入。",
    );
  range(rippleFraction, 0.001, 1.99, "电感纹波 / 平均电流");
  const duty = mode === "buck" ? vout / vin : 1 - vin / vout,
    load = vout / current,
    inductorCurrent = mode === "buck" ? current : current / (1 - duty),
    deltaI = inductorCurrent * rippleFraction,
    inductance =
      mode === "buck"
        ? ((vin - vout) * duty) / (frequency * deltaI)
        : (vin * duty) / (frequency * deltaI),
    criticalInductance =
      mode === "buck"
        ? ((1 - duty) * load) / (2 * frequency)
        : (load * duty * (1 - duty) ** 2) / (2 * frequency),
    capacitance =
      mode === "buck"
        ? deltaI / (8 * frequency * voltageRipple)
        : (current * duty) / (frequency * voltageRipple);
  return boundedResult({
    duty,
    inductorCurrent,
    deltaI,
    inductance,
    criticalInductance,
    capacitance,
    peakCurrent: inductorCurrent + deltaI / 2,
  });
}
export function powerFactorCorrection(
  powerW: number,
  lineVoltage: number,
  frequency: number,
  initial: number,
  target: number,
  connection: "star" | "delta",
) {
  positive(powerW, lineVoltage, frequency, initial, target);
  range(initial, Number.MIN_VALUE, 1, "原功率因数");
  range(target, initial, 1, "目标功率因数");
  const reactive =
      powerW * (Math.tan(Math.acos(initial)) - Math.tan(Math.acos(target))),
    perPhase =
      reactive /
      (2 *
        Math.PI *
        frequency *
        lineVoltage ** 2 *
        (connection === "delta" ? 3 : 1));
  return boundedResult({
    reactive,
    perPhase,
    currentBefore: powerW / (Math.sqrt(3) * lineVoltage * initial),
    currentAfter: powerW / (Math.sqrt(3) * lineVoltage * target),
  });
}
