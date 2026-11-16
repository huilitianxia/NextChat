import {
  solarShadow,
  landRatios,
  decodeResistor,
  rcFilter,
  seriesRLC,
  bodeMagnitude,
  opAmpGain,
  molarity,
  dilution,
  stoichiometry,
  parseBits,
  flipBit,
  cidrSubnet,
} from "../app/utils/stem-calculators";
import { regexMatches } from "../app/utils/regex-helper";
import elements from "../app/config/periodic-elements.json";
test("solar noon equinox shadows follow latitude geometry", () => {
  expect(solarShadow(45, 10, "equinox").altitude).toBeCloseTo(45);
  expect(solarShadow(45, 10, "equinox").shadow).toBeCloseTo(10);
  expect(solarShadow(0, 10, "equinox").shadow).toBeCloseTo(0);
  expect(solarShadow(-23.44, 10, "december").altitude).toBeCloseTo(90);
});
test("solar model handles night, poles and invalid bounds", () => {
  expect(solarShadow(80, 10, "december").shadow).toBeNull();
  expect(solarShadow(0, 10, "equinox", 0).daylight).toBe(false);
  expect(() => solarShadow(91, 10, "june")).toThrow();
  expect(() => solarShadow(40, -1, "june")).toThrow();
  expect(() => solarShadow(40, 10, "june", 25)).toThrow();
});
test("land ratios use area units consistently", () => {
  expect(landRatios(10000, 25000, 3500)).toEqual({
    far: 2.5,
    greenPercent: 35,
  });
  expect(() => landRatios(0, 1, 0)).toThrow();
  expect(() => landRatios(10, 1, 11)).toThrow();
});
test("four and five resistor bands include fractional multipliers", () => {
  expect(decodeResistor(["brown", "black", "red", "gold"])).toMatchObject({
    ohms: 1000,
    tolerance: 5,
    min: 950,
    max: 1050,
  });
  expect(decodeResistor(["brown", "black", "black", "red", "brown"]).ohms).toBe(
    10000,
  );
  expect(
    decodeResistor(["yellow", "violet", "gold", "silver"]).ohms,
  ).toBeCloseTo(4.7);
  expect(() => decodeResistor(["gold", "red", "red", "gold"])).toThrow();
});
test("RC magnitude is minus 3dB at cutoff", () => {
  const result = rcFilter(1000, 1e-6);
  expect(result.cutoff).toBeCloseTo(159.154943);
  expect(result.tau).toBe(0.001);
  expect(bodeMagnitude(result.cutoff, 1000, 1e-6)).toBeCloseTo(-3.0103, 4);
  expect(() => rcFilter(0, 1)).toThrow();
});
test("series RLC bandwidth, Q and both half-power points agree", () => {
  const r = seriesRLC(10, 0.01, 1e-6);
  expect(r.center).toBeCloseTo(1591.54943);
  expect(r.q).toBeCloseTo(10);
  expect(r.high - r.low).toBeCloseTo(r.bandwidth, 6);
  expect(bodeMagnitude(r.center, 10, 1e-6, 0.01)).toBeCloseTo(0);
  expect(bodeMagnitude(r.low, 10, 1e-6, 0.01)).toBeCloseTo(-3.0103, 4);
  expect(bodeMagnitude(r.high, 10, 1e-6, 0.01)).toBeCloseTo(-3.0103, 4);
});
test("op amp calculations respect polarity and reject zero input resistance", () => {
  expect(opAmpGain("inverting", 1000, 10000)).toBe(-10);
  expect(opAmpGain("noninverting", 1000, 10000)).toBe(11);
  expect(() => opAmpGain("noninverting", 0, 1)).toThrow();
});
test("very low-Q RLC retains a positive lower cutoff", () => {
  const result = seriesRLC(1e9, 1e-3, 1e-3);
  expect(result.low).toBeGreaterThan(0);
  expect(bodeMagnitude(result.low, 1e9, 1e-3, 1e-3)).toBeCloseTo(-3.0103, 4);
  expect(() => rcFilter(1e308, 1e308)).toThrow();
});
test("molarity uses milliliters and dilution respects final volume", () => {
  expect(molarity(5.844, 58.44, 1000)).toEqual({
    moles: 0.1,
    concentration: 0.1,
  });
  expect(dilution(1, 0.1, 100)).toEqual({ stockMl: 10, solventMl: 90 });
  expect(() => dilution(0.1, 1, 100)).toThrow();
  expect(() => molarity(-1, 1, 1000)).toThrow();
  expect(stoichiometry(2, 2, 1, 18)).toEqual({ moles: 1, grams: 18 });
});
test("periodic data contains 118 distinct elements and core properties", () => {
  expect(elements).toHaveLength(118);
  expect(new Set(elements.map((e) => e.number)).size).toBe(118);
  expect(elements[5]).toMatchObject({ number: 6, symbol: "C" });
  expect(Number(elements[5].mass)).toBeCloseTo(12.011, 2);
  expect(elements.every((e) => e.configuration && e.mass)).toBe(true);
});
test("64-bit values stay exact without Number truncation", () => {
  const max = parseBits("0xFFFFFFFFFFFFFFFF", 64);
  expect(max).toBe((1n << 64n) - 1n);
  expect(flipBit(0n, 63, 64)).toBe(9223372036854775808n);
  expect(flipBit(max, 63, 64)).toBe((1n << 63n) - 1n);
  expect(parseBits("0b101010", 32)).toBe(42n);
  expect(() => parseBits("4294967296", 32)).toThrow();
  expect(() => flipBit(0n, 64, 64)).toThrow();
});
test("IPv4 CIDR computes network broadcast and usable range", () => {
  expect(cidrSubnet("192.168.1.42/24")).toMatchObject({
    version: 4,
    network: "192.168.1.0",
    mask: "255.255.255.0",
    last: "192.168.1.255",
    count: "256",
    usable: "254",
    firstHost: "192.168.1.1",
    lastHost: "192.168.1.254",
    broadcast: "192.168.1.255",
  });
  expect(cidrSubnet("0.0.0.0/0").count).toBe("4294967296");
});
test("IPv4 /31 and /32 do not incorrectly subtract reserved hosts", () => {
  expect(cidrSubnet("192.0.2.1/31")).toMatchObject({
    usable: "2",
    firstHost: "192.0.2.0",
    lastHost: "192.0.2.1",
    broadcast: null,
  });
  expect(cidrSubnet("192.0.2.1/32")).toMatchObject({
    usable: "1",
    network: "192.0.2.1",
    broadcast: null,
  });
});
test("IPv6 handles compression, huge host counts and embedded IPv4", () => {
  expect(cidrSubnet("2001:db8:1::abcd/64")).toMatchObject({
    version: 6,
    network: "2001:db8:1::",
    last: "2001:db8:1:0:ffff:ffff:ffff:ffff",
    count: "18446744073709551616",
    broadcast: null,
  });
  expect(cidrSubnet("::1/128").network).toBe("::1");
  expect(cidrSubnet("::ffff:192.0.2.1/120").network).toBe("::ffff:c000:200");
  expect(cidrSubnet("::/0").count).toBe((1n << 128n).toString());
});
test.each([
  "192.168.1.999/24",
  "192.168.001.1/24",
  "192.0.2.1/33",
  "2001:db8::1/129",
  "2001::db8::1/64",
  "1:2:3/64",
  ":::/64",
  "text",
  "1.2.3.4/-1",
])("rejects malformed CIDR %s", (input) =>
  expect(() => cidrSubnet(input)).toThrow(),
);
test("regex groups and zero-length Unicode matches progress correctly", () => {
  expect(regexMatches("a", "", "aaa")).toHaveLength(1);
  expect(regexMatches("(?:)", "gv", "😀").map((m) => m.index)).toEqual([0, 2]);
  expect(regexMatches("(a)(b)", "g", "ab")[0]).toEqual({
    index: 0,
    text: "ab",
    groups: ["a", "b"],
  });
  expect(regexMatches("(?:)", "gu", "😀").map((m) => m.index)).toEqual([0, 2]);
  expect(() => regexMatches("[", "g", "text")).toThrow();
  expect(() => regexMatches("a", "gg", "a")).toThrow();
  expect(regexMatches("a", "g", "a".repeat(1000))).toHaveLength(500);
});
