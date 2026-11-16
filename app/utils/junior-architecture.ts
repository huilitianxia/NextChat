import { positive, range, boundedResult } from "./junior-common";
const rad = Math.PI / 180,
  wrap = (n: number) => ((n % 360) + 360) % 360;
function solarTerms(utcMs: number) {
  const t = (utcMs / 86400000 + 2440587.5 - 2451545) / 36525,
    l = wrap(280.46646 + t * (36000.76983 + 0.0003032 * t)),
    m = wrap(357.52911 + t * (35999.05029 - 0.0001537 * t)),
    e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t),
    c =
      Math.sin(m * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
      Math.sin(2 * m * rad) * (0.019993 - 0.000101 * t) +
      Math.sin(3 * m * rad) * 0.000289,
    omega = 125.04 - 1934.136 * t,
    longitude = wrap(l + c - 0.00569 - 0.00478 * Math.sin(omega * rad)),
    obliquity =
      23 +
      (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 +
      0.00256 * Math.cos(omega * rad),
    declination =
      Math.asin(Math.sin(obliquity * rad) * Math.sin(longitude * rad)) / rad,
    y = Math.tan((obliquity * rad) / 2) ** 2,
    equationOfTime =
      (4 / rad) *
      (y * Math.sin(2 * l * rad) -
        2 * e * Math.sin(m * rad) +
        4 * e * y * Math.sin(m * rad) * Math.cos(2 * l * rad) -
        0.5 * y * y * Math.sin(4 * l * rad) -
        1.25 * e * e * Math.sin(2 * m * rad));
  return { declination, equationOfTime, longitude };
}
function dateUtc(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("日期格式应为 YYYY-MM-DD。");
  const time = Date.parse(date + "T00:00:00Z");
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== date ||
    Number(date.slice(0, 4)) < 1900 ||
    Number(date.slice(0, 4)) > 2100
  )
    throw new Error("日期范围为 1900–2100 年内的有效日期。");
  return time;
}
export type SunInput = {
  latitude: number;
  longitude: number;
  timezone: number;
  date: string;
  hour: number;
  solarTime: boolean;
};
export function solarPosition(p: SunInput) {
  range(p.latitude, -90, 90, "纬度");
  range(p.longitude, -180, 180, "经度");
  range(p.timezone, -14, 14, "时区");
  range(p.hour, 0, 24, "时间");
  const midnight = dateUtc(p.date);
  let clockHour = p.hour;
  if (p.solarTime)
    for (let i = 0; i < 3; i++) {
      const terms = solarTerms(midnight + (clockHour - p.timezone) * 3600000);
      clockHour =
        p.hour -
        (terms.equationOfTime + 4 * p.longitude - 60 * p.timezone) / 60;
    }
  const terms = solarTerms(midnight + (clockHour - p.timezone) * 3600000),
    solarHour =
      clockHour +
      (terms.equationOfTime + 4 * p.longitude - 60 * p.timezone) / 60,
    hourAngle = (solarHour * 15 - 180) * rad,
    lat = p.latitude * rad,
    dec = terms.declination * rad,
    altitude =
      Math.asin(
        Math.max(
          -1,
          Math.min(
            1,
            Math.sin(lat) * Math.sin(dec) +
              Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle),
          ),
        ),
      ) / rad,
    azimuth = wrap(
      Math.atan2(
        Math.sin(hourAngle),
        Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat),
      ) /
        rad +
        180,
    );
  return {
    ...terms,
    clockHour,
    solarHour,
    altitude,
    azimuth,
    daylight: altitude > 0,
  };
}
export function solarTermDate(
  year: number,
  term: "winter" | "cold",
  timezone = 8,
) {
  range(year, 1900, 2100, "年份");
  range(timezone, -14, 14, "时区");
  if (!Number.isInteger(year)) throw new Error("年份须为整数。");
  let lo = Date.UTC(year, term === "winter" ? 11 : 0, 15),
    hi = Date.UTC(year, term === "winter" ? 11 : 0, 28);
  const target = term === "winter" ? 270 : 300;
  for (let i = 0; i < 45; i++) {
    const mid = (lo + hi) / 2,
      diff = ((solarTerms(mid).longitude - target + 540) % 360) - 180;
    if (diff < 0) lo = mid;
    else hi = mid;
  }
  return new Date((lo + hi) / 2 + timezone * 3600000)
    .toISOString()
    .slice(0, 10);
}
export type SunlightInput = Omit<SunInput, "hour"> & {
  start: number;
  end: number;
  distance: number;
  heightDifference: number;
  width: number;
  facadeBearing: number;
  requiredHours: number;
};
export function sunlightDuration(p: SunlightInput) {
  positive(p.distance, p.width);
  range(p.heightDifference, 0, 1000, "遮挡物高于计算点的高度");
  range(p.start, 0, 24, "起始时间");
  range(p.end, 0, 24, "终止时间");
  range(p.facadeBearing, 0, 360, "立面朝向");
  range(p.requiredHours, 0, 24, "参考时数");
  if (p.end <= p.start) throw new Error("终止时间必须晚于起始时间。");
  const count = Math.ceil((p.end - p.start) * 60),
    dt = (p.end - p.start) / count;
  let hours = 0;
  const samples = Array.from({ length: count }, (_, i) => {
    const hour = p.start + (i + 0.5) * dt,
      sun = solarPosition({ ...p, hour }),
      az = (sun.azimuth - p.facadeBearing) * rad,
      alt = sun.altitude * rad,
      dot = Math.cos(alt) * Math.cos(az),
      front = sun.daylight && dot > 1e-10,
      ray = front ? p.distance / dot : 0,
      lateral = ray * Math.cos(alt) * Math.sin(az),
      rayHeight = ray * Math.sin(alt),
      blocked =
        front &&
        Math.abs(lateral) <= p.width / 2 &&
        rayHeight < p.heightDifference,
      visible = front && !blocked;
    if (visible) hours += dt;
    return { x: hour, y: sun.altitude, visible, blocked, azimuth: sun.azimuth };
  });
  return {
    hours,
    minutes: hours * 60,
    meetsReference: hours + 1e-9 >= p.requiredHours,
    samples,
    stepMinutes: dt * 60,
  };
}
export function shadowVector(
  height: number,
  sun: ReturnType<typeof solarPosition>,
) {
  positive(height);
  if (!sun.daylight) return null;
  const length = height / Math.tan(sun.altitude * rad);
  return {
    length,
    east: -length * Math.sin(sun.azimuth * rad),
    north: -length * Math.cos(sun.azimuth * rad),
  };
}
export type ThermalLayer = {
  name: string;
  thicknessMm: number;
  conductivity: number;
};
export function thermalEnvelope(
  layers: ThermalLayer[],
  inside: number,
  outside: number,
  limit: number,
) {
  if (!layers.length || layers.length > 20)
    throw new Error("请提供 1–20 层材料。");
  range(inside, 0, 1, "内表面热阻");
  range(outside, 0, 1, "外表面热阻");
  positive(limit);
  const resistances = layers.map((l) => {
      positive(l.thicknessMm, l.conductivity);
      return l.thicknessMm / 1000 / l.conductivity;
    }),
    resistance = inside + outside + resistances.reduce((a, b) => a + b, 0),
    uValue = 1 / resistance;
  boundedResult({ resistance, uValue });
  return { resistances, resistance, uValue, meetsReference: uValue <= limit };
}
