function finite(...values: number[]) {
  if (values.some((n) => !Number.isFinite(n)))
    throw new Error("请输入有效数字。");
}
function positive(...values: number[]) {
  finite(...values);
  if (values.some((n) => n <= 0)) throw new Error("输入值必须大于 0。");
}
export function solarShadow(
  latitude: number,
  height: number,
  season: "june" | "equinox" | "december",
  solarHour = 12,
) {
  finite(latitude, height, solarHour);
  if (Math.abs(latitude) > 90 || height < 0 || solarHour < 0 || solarHour > 24)
    throw new Error("纬度范围 −90～90°，高度不能为负，太阳时为 0～24 点。");
  const declination = { june: 23.44, equinox: 0, december: -23.44 }[season];
  if (declination === undefined) throw new Error("请选择有效节气。");
  const r = Math.PI / 180,
    hourAngle = (solarHour - 12) * 15;
  const sin =
    Math.sin(latitude * r) * Math.sin(declination * r) +
    Math.cos(latitude * r) *
      Math.cos(declination * r) *
      Math.cos(hourAngle * r);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sin))) / r;
  return {
    altitude,
    declination,
    shadow: altitude <= 0.001 ? null : height / Math.tan(altitude * r),
    daylight: altitude > 0,
  };
}
export function landRatios(
  siteArea: number,
  floorArea: number,
  greenArea: number,
) {
  positive(siteArea);
  finite(floorArea, greenArea);
  if (floorArea < 0 || greenArea < 0 || greenArea > siteArea)
    throw new Error("建筑面积不能为负，绿地面积须在用地面积范围内。");
  return {
    far: floorArea / siteArea,
    greenPercent: (greenArea / siteArea) * 100,
  };
}
export const RESISTOR_COLORS = [
  "black",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "violet",
  "gray",
  "white",
] as const;
export const RESISTOR_TOLERANCE: Record<string, number> = {
  brown: 1,
  red: 2,
  green: 0.5,
  blue: 0.25,
  violet: 0.1,
  gray: 0.05,
  gold: 5,
  silver: 10,
  none: 20,
};
export function decodeResistor(bands: string[]) {
  if (![4, 5].includes(bands.length)) throw new Error("请选择四环或五环电阻。");
  const digits = bands
    .slice(0, -2)
    .map((s) => RESISTOR_COLORS.indexOf(s as any));
  const color = bands.at(-2)!,
    exponent =
      color === "gold"
        ? -1
        : color === "silver"
        ? -2
        : RESISTOR_COLORS.indexOf(color as any);
  if (
    digits.some((x) => x < 0) ||
    digits[0] === 0 ||
    (!RESISTOR_COLORS.includes(color as any) &&
      !["gold", "silver"].includes(color)) ||
    !Object.hasOwn(RESISTOR_TOLERANCE, bands.at(-1)!)
  )
    throw new Error("色环组合无效。");
  const ohms = Number(digits.join("")) * 10 ** exponent,
    tolerance = RESISTOR_TOLERANCE[bands.at(-1)!];
  return {
    ohms,
    tolerance,
    min: ohms * (1 - tolerance / 100),
    max: ohms * (1 + tolerance / 100),
  };
}
export function rcFilter(rOhm: number, cFarad: number) {
  positive(rOhm, cFarad);
  const tau = rOhm * cFarad,
    cutoff = 1 / (2 * Math.PI * tau);
  positive(tau, cutoff);
  return { cutoff, tau };
}
export function seriesRLC(rOhm: number, lHenry: number, cFarad: number) {
  positive(rOhm, lHenry, cFarad);
  const omega = 1 / Math.sqrt(lHenry * cFarad),
    q = (omega * lHenry) / rOhm,
    bandwidth = rOhm / (2 * Math.PI * lHenry),
    center = omega / (2 * Math.PI);
  positive(center, q, bandwidth);
  const edge = Math.hypot(1, 1 / (2 * q)),
    high = center * (edge + 1 / (2 * q)),
    low = center / (edge + 1 / (2 * q));
  positive(low, high);
  return {
    center,
    q,
    bandwidth,
    low,
    high,
  };
}
export function bodeMagnitude(
  frequency: number,
  rOhm: number,
  cFarad: number,
  lHenry?: number,
) {
  positive(frequency, rOhm, cFarad);
  const w = 2 * Math.PI * frequency;
  if (lHenry !== undefined) {
    positive(lHenry);
    return (
      20 * Math.log10(rOhm / Math.hypot(rOhm, w * lHenry - 1 / (w * cFarad)))
    );
  }
  return -10 * Math.log10(1 + (w * rOhm * cFarad) ** 2);
}
export function opAmpGain(
  mode: "inverting" | "noninverting",
  inputResistance: number,
  feedbackResistance: number,
) {
  positive(inputResistance);
  finite(feedbackResistance);
  if (feedbackResistance < 0) throw new Error("反馈电阻不能为负。");
  return mode === "inverting"
    ? -feedbackResistance / inputResistance
    : 1 + feedbackResistance / inputResistance;
}
export function molarity(
  massGrams: number,
  molarMass: number,
  volumeMl: number,
) {
  finite(massGrams);
  positive(molarMass, volumeMl);
  if (massGrams < 0) throw new Error("质量不能为负。");
  return {
    moles: massGrams / molarMass,
    concentration: massGrams / molarMass / (volumeMl / 1000),
  };
}
export function dilution(c1: number, c2: number, finalMl: number) {
  positive(c1, c2, finalMl);
  if (c2 > c1) throw new Error("稀释后的浓度不能高于原液。");
  const stockMl = (c2 * finalMl) / c1;
  return { stockMl, solventMl: finalMl - stockMl };
}
export function stoichiometry(
  givenMoles: number,
  givenCoefficient: number,
  targetCoefficient: number,
  targetMolarMass: number,
) {
  finite(givenMoles);
  positive(givenCoefficient, targetCoefficient, targetMolarMass);
  if (givenMoles < 0) throw new Error("物质的量不能为负。");
  const moles = (givenMoles * targetCoefficient) / givenCoefficient;
  return { moles, grams: moles * targetMolarMass };
}
export function parseBits(input: string, width: 32 | 64) {
  const value = input.trim();
  if (!/^(?:0x[\da-f]+|0b[01]+|\d+)$/i.test(value))
    throw new Error("请输入十进制、0x 十六进制或 0b 二进制无符号整数。");
  const number = BigInt(value);
  if (number >= 1n << BigInt(width))
    throw new Error(`数值超出 ${width} 位范围。`);
  return number;
}
export function flipBit(value: bigint, bit: number, width: 32 | 64) {
  if (
    !Number.isInteger(bit) ||
    bit < 0 ||
    bit >= width ||
    value < 0n ||
    value >= 1n << BigInt(width)
  )
    throw new Error("位索引或数值越界。");
  return value ^ (1n << BigInt(bit));
}
function ipv4(value: string) {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some(
      (s) =>
        !/^\d{1,3}$/.test(s) ||
        Number(s) > 255 ||
        (s.length > 1 && s.startsWith("0")),
    )
  )
    throw new Error("IPv4 地址无效。");
  return parts.reduce((n, s) => (n << 8n) | BigInt(s), 0n);
}
function ipv6(input: string) {
  let value = input.toLowerCase();
  if (value.includes(".")) {
    const start = value.lastIndexOf(":");
    const tail = ipv4(value.slice(start + 1));
    value =
      value.slice(0, start + 1) +
      (tail >> 16n).toString(16) +
      ":" +
      (tail & 65535n).toString(16);
  }
  if (!/^[0-9a-f:]+$/.test(value) || value.split("::").length > 2)
    throw new Error("IPv6 地址无效。");
  const split = value.split("::"),
    left = split[0] ? split[0].split(":") : [],
    right = split[1] ? split[1].split(":") : [];
  if (
    [...left, ...right].some((s) => !s || s.length > 4) ||
    (split.length === 1 ? left.length !== 8 : left.length + right.length >= 8)
  )
    throw new Error("IPv6 地址无效。");
  return [
    ...left,
    ...Array(split.length === 2 ? 8 - left.length - right.length : 0).fill("0"),
    ...right,
  ].reduce((n, s) => (n << 16n) | BigInt("0x" + s), 0n);
}
export function formatIp(value: bigint, version: 4 | 6) {
  if (version === 4)
    return [24, 16, 8, 0]
      .map((shift) => String((value >> BigInt(shift)) & 255n))
      .join(".");
  const parts = Array.from({ length: 8 }, (_, i) =>
    ((value >> BigInt(112 - i * 16)) & 65535n).toString(16),
  );
  let best = -1,
    length = 1;
  for (let i = 0; i < 8; i++) {
    if (parts[i] !== "0") continue;
    let j = i;
    while (j < 8 && parts[j] === "0") j++;
    if (j - i > length) {
      best = i;
      length = j - i;
    }
    i = j - 1;
  }
  return best < 0
    ? parts.join(":")
    : parts.slice(0, best).join(":") +
        "::" +
        parts.slice(best + length).join(":");
}
export function cidrSubnet(input: string) {
  const parts = input.trim().split("/");
  if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1]))
    throw new Error("请输入地址/前缀，例如 192.168.1.10/24。");
  const version: 4 | 6 = parts[0].includes(":") ? 6 : 4,
    bits = version === 4 ? 32 : 128,
    prefix = Number(parts[1]);
  if (prefix < 0 || prefix > bits) throw new Error("CIDR 前缀超出范围。");
  const address = version === 4 ? ipv4(parts[0]) : ipv6(parts[0]),
    count = 1n << BigInt(bits - prefix),
    mask = ((1n << BigInt(bits)) - 1n) ^ (count - 1n),
    network = address & mask,
    last = network + count - 1n;
  const reserve = version === 4 && prefix < 31 ? 1n : 0n;
  return {
    version,
    prefix,
    network: formatIp(network, version),
    last: formatIp(last, version),
    mask: formatIp(mask, version),
    firstHost: formatIp(network + reserve, version),
    lastHost: formatIp(last - reserve, version),
    count: count.toString(),
    usable: (count - reserve * 2n).toString(),
    broadcast: version === 4 && prefix < 31 ? formatIp(last, version) : null,
  };
}
