export const ARCH_REFERENCES = {
  stair: {
    title: "住宅公共楼梯 · GB 55038-2025",
    url: "https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2025/art_66adac27fa2144bb86f98fe4c297efd6.html",
    detail:
      "住宅公共楼梯踏步宽度不小于 260 mm，高度不大于 175 mm；同一梯段宽高一致。仅检查这两个尺寸，不代表全部条文审查。",
  },
  ramp: {
    title: "轮椅坡道 · GB 55019-2021",
    url: "https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bzzl/202112/P020211228345970190464.pdf",
    detail:
      "一般纵坡不陡于 1:12，横坡不陡于 1:50；单段提升不超过 750 mm，通行净宽不小于 1.20 m。受限且高差不超过 150 mm 的特殊条件需单独核对 1:10 条款。",
  },
  parking: {
    title: "小型车位参考 · JGJ 100-2015",
    url: "https://www.xingguo.gov.cn/xgxxxgk/cxgh/202202/af0f3a533adf4d7c93df099c8f7be29c/files/be41b4aa52e74f948f5bbee619650a38.pdf",
    detail:
      "垂直后退停车参考 2.4 × 5.3 m；实际须结合车型、停车方式、墙柱与通车道条件。无障碍车位侧方轮椅通道至少 1.20 m。",
  },
  daylight: {
    title: "日照按项目所在地分析",
    url: "https://ghj.nanjing.gov.cn/njsgtzyj/202607/t20260710_5875057.html",
    detail:
      "不存在全国统一的住宅日照间距系数。几何影长只用于教学；实际项目应采用当地规划要求和完整日照分析。",
  },
} as const;
const positive = (...n: number[]) => {
  if (n.some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error("请输入大于 0 的有效数值。");
};
export function stairDimensions(
  floorMm: number,
  riserMm: number,
  treadMm: number,
) {
  positive(floorMm, riserMm, treadMm);
  const risers = Math.ceil(floorMm / riserMm),
    actualRiser = floorMm / risers;
  return {
    risers,
    actualRiser,
    walkingSum: 2 * actualRiser + treadMm,
    ratio: actualRiser / treadMm,
    angle: (Math.atan(actualRiser / treadMm) * 180) / Math.PI,
    riserWithinLimit: actualRiser <= 175,
    treadWithinLimit: treadMm >= 260,
  };
}
export function rampDimensions(riseMm: number, denominator = 12) {
  positive(riseMm, denominator);
  return {
    runMm: riseMm * denominator,
    flightCount: Math.ceil(riseMm / 750),
    gradePercent: 100 / denominator,
    standardSlope: denominator >= 12,
  };
}
export function parkingDimensions(
  count: number,
  width = 2.4,
  length = 5.3,
  accessible = false,
) {
  positive(width, length);
  if (!Number.isInteger(count) || count < 1 || count > 10000)
    throw new Error("车位数量需要为 1–10,000 的整数。");
  return {
    width: width + (accessible ? 1.2 : 0),
    length,
    netArea: count * (width + (accessible ? 1.2 : 0)) * length,
    aisleIncluded: false,
  };
}
export function daylightSpacing(
  heightDifference: number,
  value: number,
  mode: "angle" | "coefficient" = "angle",
) {
  positive(heightDifference, value);
  if (mode === "angle" && value >= 90)
    throw new Error("太阳高度角须在 0–90° 之间。");
  const coefficient =
    mode === "angle" ? 1 / Math.tan((value * Math.PI) / 180) : value;
  return { coefficient, spacing: heightDifference * coefficient };
}
