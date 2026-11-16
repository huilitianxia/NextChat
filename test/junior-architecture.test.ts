import {
  solarPosition,
  solarTermDate,
  sunlightDuration,
  shadowVector,
  thermalEnvelope,
} from "../app/utils/junior-architecture";
const site = {
  latitude: 31.23,
  longitude: 121.47,
  timezone: 8,
  date: "2026-12-22",
  hour: 12,
  solarTime: true,
};
const geometry = {
  ...site,
  start: 8,
  end: 16,
  distance: 25,
  heightDifference: 15,
  width: 40,
  facadeBearing: 180,
  requiredHours: 2,
};
test("winter noon solar height and south bearing agree with spherical geometry", () => {
  const p = solarPosition(site);
  expect(p.altitude).toBeCloseTo(35.33, 1);
  expect(p.azimuth).toBeCloseTo(180, 6);
  expect(p.solarHour).toBeCloseTo(12, 8);
  const shadow = shadowVector(10, p)!;
  expect(shadow.east).toBeCloseTo(0, 8);
  expect(shadow.north).toBeGreaterThan(14);
  expect(shadow.north).toBeLessThan(14.2);
});
test("Meeus position reproduces the published NREL site example within 0.04 degrees", () => {
  const p = solarPosition({
    latitude: 39.742476,
    longitude: -105.1786,
    timezone: -7,
    date: "2003-10-17",
    hour: 12.5083333333,
    solarTime: false,
  });
  expect(Math.abs(p.altitude - 39.872)).toBeLessThan(0.04);
  expect(Math.abs(p.azimuth - 194.34)).toBeLessThan(0.04);
});
test("clock and solar hour conversions yield the same physical instant", () => {
  const a = solarPosition({ ...site, hour: 9 }),
    b = solarPosition({ ...site, hour: a.clockHour, solarTime: false });
  expect(b.altitude).toBeCloseTo(a.altitude, 9);
  expect(b.azimuth).toBeCloseTo(a.azimuth, 9);
});
test("night and polar winter have no shadow", () => {
  expect(shadowVector(10, solarPosition({ ...site, hour: 0 }))).toBeNull();
  expect(solarPosition({ ...site, latitude: 85 }).daylight).toBe(false);
});
test("astronomical longitude finds the local standard dates", () => {
  expect(solarTermDate(2026, "cold", 8)).toBe("2026-01-20");
  expect(solarTermDate(2025, "winter", 8)).toBe("2025-12-21");
  expect(solarTermDate(2026, "winter", 8)).toBe("2026-12-22");
});
test.each([
  { date: "2026-02-30" },
  { date: "bad" },
  { latitude: 91 },
  { longitude: 181 },
  { timezone: 20 },
  { hour: -1 },
  { date: "1700-01-01" },
])("solar invalid input %p", (bad) =>
  expect(() => solarPosition({ ...site, ...bad })).toThrow(),
);
test("visibility integrates minutes and geometry rather than a fixed spacing coefficient", () => {
  const clear = sunlightDuration({ ...geometry, heightDifference: 0 });
  expect(clear.hours).toBeCloseTo(8, 8);
  expect(clear.stepMinutes).toBe(1);
  expect(clear.meetsReference).toBe(true);
  const blocked = sunlightDuration({
    ...geometry,
    heightDifference: 100,
    width: 1000,
  });
  expect(blocked.hours).toBe(0);
  expect(blocked.meetsReference).toBe(false);
  const narrow = sunlightDuration({ ...geometry, width: 1 }),
    wide = sunlightDuration({ ...geometry, width: 100 });
  expect(narrow.hours).toBeGreaterThan(wide.hours);
  expect(sunlightDuration({ ...geometry, facadeBearing: 0 }).hours).toBe(0);
});
test.each([
  { distance: 0 },
  { width: 0 },
  { heightDifference: -1 },
  { start: 16, end: 8 },
  { requiredHours: 25 },
])("sunlight rejects invalid model parameters %p", (bad) =>
  expect(() => sunlightDuration({ ...geometry, ...bad })).toThrow(),
);
test("layer thickness converts mm to m and resistance is additive", () => {
  const p = thermalEnvelope(
    [{ name: "insulation", thicknessMm: 100, conductivity: 0.04 }],
    0.11,
    0.04,
    0.5,
  );
  expect(p.resistances).toEqual([2.5]);
  expect(p.resistance).toBeCloseTo(2.65, 12);
  expect(p.uValue).toBeCloseTo(0.377358490566, 10);
  expect(p.meetsReference).toBe(true);
  expect(
    thermalEnvelope(
      [{ name: "wall", thicknessMm: 200, conductivity: 2 }],
      0.1,
      0.1,
      1,
    ).meetsReference,
  ).toBe(false);
});
test("invalid layers and thermal boundary rejected", () => {
  expect(() => thermalEnvelope([], 0.1, 0.1, 1)).toThrow();
  expect(() =>
    thermalEnvelope(
      [{ name: "bad", thicknessMm: 100, conductivity: 0 }],
      0.1,
      0.1,
      1,
    ),
  ).toThrow();
  expect(() =>
    thermalEnvelope(
      [{ name: "bad", thicknessMm: -1, conductivity: 1 }],
      0.1,
      0.1,
      1,
    ),
  ).toThrow();
});
