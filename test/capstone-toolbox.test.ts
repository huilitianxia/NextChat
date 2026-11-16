import {
  caesar,
  cipherWaterfall,
  decodeBase32,
  decodeBase58,
  decodeBase64,
  decodeBase85,
  identifyHash,
  railFenceDecode,
} from "../app/utils/classical-ciphers";
import {
  algorithmNumbers,
  bstSteps,
  dijkstraGrid,
  quickSortSteps,
} from "../app/utils/algorithm-steps";
import {
  daylightSpacing,
  parkingDimensions,
  rampDimensions,
  stairDimensions,
} from "../app/utils/architecture-reference";
import { TextDecoder } from "node:util";
Object.assign(globalThis, { TextDecoder });
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
test.each([
  ["MY======", "f"],
  ["MZXQ====", "fo"],
  ["MZXW6===", "foo"],
  ["MZXW6YQ=", "foob"],
  ["MZXW6YTB", "fooba"],
  ["MZXW6YTBOI======", "foobar"],
])("Base32 RFC4648 vector %s", (input, text) =>
  expect(decode(decodeBase32(input))).toBe(text),
);
test.each(["M", "MZ======", "MZXW6Y==", "0!"])("invalid Base32 %s", (input) =>
  expect(() => decodeBase32(input)).toThrow(),
);
test("Base58 Bitcoin known vector and leading zeros", () => {
  expect(decode(decodeBase58("JxF12TrwUP45BMd"))).toBe("Hello World");
  expect([...decodeBase58("112")]).toEqual([0, 0, 1]);
  expect(() => decodeBase58("0OIl")).toThrow();
});
test("Base64 standard and URL-safe", () => {
  expect(decode(decodeBase64("SGVsbG8="))).toBe("Hello");
  expect([...decodeBase64("-_8")]).toEqual([251, 255]);
  expect(() => decodeBase64("a")).toThrow();
});
test("Ascii85 Adobe vector, partial group and z abbreviation", () => {
  expect(decode(decodeBase85("<~87cURD]j7BEbo80~>"))).toBe("Hello world!");
  expect([...decodeBase85("z")]).toEqual([0, 0, 0, 0]);
  expect(decode(decodeBase85("BOu!rDZ"))).toBe("hello");
  expect(() => decodeBase85("!z")).toThrow();
  expect(() => decodeBase85("uuuuu")).toThrow();
});
test("Base85 RFC1924 Python-compatible vector", () =>
  expect(decode(decodeBase85("Xk~0{Zv", "rfc1924"))).toBe("hello"));
test("classical Caesar and Rail Fence known vectors", () => {
  expect(caesar("Uryyb, Jbeyq! 中文", 13)).toBe("Hello, World! 中文");
  expect(caesar("BCD xyz", 1)).toBe("ABC wxy");
  expect(railFenceDecode("WECRLTEERDSOEEFEAOCAIVDEN", 3)).toBe(
    "WEAREDISCOVEREDFLEEATONCE",
  );
  expect(() => railFenceDecode("abc", 1)).toThrow();
});
test("waterfall includes all shifts and rail counts with no input execution", () => {
  const previews = cipherWaterfall("SGVsbG8=");
  expect(previews.filter((p) => p.name.startsWith("Caesar"))).toHaveLength(25);
  expect(previews.filter((p) => p.name.startsWith("Rail"))).toHaveLength(7);
  expect(previews.find((p) => p.name === "Base64 / URL-safe")?.text).toBe(
    "Hello",
  );
  expect(() => cipherWaterfall("x".repeat(8001))).toThrow();
});
test.each([
  [32, "MD5"],
  [40, "SHA-1"],
  [64, "SHA-256"],
])("hex length %i is only a candidate", (length, label) =>
  expect(identifyHash("a".repeat(length))).toEqual([
    expect.stringContaining(label),
  ]),
);
test("bcrypt and JWT structural identification never claims signature verification", () => {
  expect(identifyHash("$2b$12$" + "a".repeat(53))[0]).toContain("bcrypt");
  expect(identifyHash("eyJhIjoxfQ.eyJiIjoyfQ.abc")[0]).toContain("JWT");
  expect(
    cipherWaterfall("eyJhIjoxfQ.eyJiIjoyfQ.abc").find((p) =>
      p.name.startsWith("JWT payload"),
    )?.text,
  ).toBe('{"b":2}');
});
test("QuickSort final sorted output and immutable intermediate snapshots", () => {
  const input = [3, -2, 3, 0, 9],
    f = quickSortSteps(input);
  expect(f.at(-1)?.values).toEqual([-2, 0, 3, 3, 9]);
  expect(f[0].values).toEqual(input);
  expect(input).toEqual([3, -2, 3, 0, 9]);
});
test.each([
  ["in", [1, 2, 2, 3]],
  ["pre", [2, 2, 1, 3]],
  ["post", [1, 3, 2, 2]],
] as const)("BST %s traversal and duplicates", (order, expected) => {
  const f = bstSteps([2, 1, 3, 2], order);
  expect(f.at(-1)?.output).toEqual(expected);
  expect(f[0].nodes).toHaveLength(1);
});
test("Dijkstra avoids expensive terrain and reports exact shortest cost", () => {
  const f = dijkstraGrid(3, 3, [], { 1: 9 });
  expect(f.at(-1)?.distances?.[8]).toBe(4);
  expect(f.at(-1)?.path).toEqual([0, 3, 4, 5, 8]);
});
test("Dijkstra unreachable and bad parameters handled", () => {
  expect(dijkstraGrid(3, 3, [1, 3], {}).at(-1)?.caption).toBe("终点不可达");
  expect(() => dijkstraGrid(3, 3, [0], {})).toThrow();
  expect(() => dijkstraGrid(3, 3, [], { 1: -1 })).toThrow();
});
test("input parser rejects excessive/non-numeric sequences", () => {
  expect(algorithmNumbers("1，2 -3")).toEqual([1, 2, -3]);
  for (const s of ["", "abc", "1e9", Array(25).fill(1).join(",")])
    expect(() => algorithmNumbers(s)).toThrow();
});
test("stair actual dimensions, normative boundary and ergonomic sum", () => {
  const s = stairDimensions(3000, 175, 260);
  expect(s.risers).toBe(18);
  expect(s.actualRiser).toBeCloseTo(166.6667, 3);
  expect(s.riserWithinLimit && s.treadWithinLimit).toBe(true);
  expect(stairDimensions(3500, 175, 259).treadWithinLimit).toBe(false);
});
test("ramp rise segmentation and longitudinal slope", () => {
  expect(rampDimensions(1500)).toMatchObject({
    runMm: 18000,
    flightCount: 2,
    standardSlope: true,
  });
  expect(rampDimensions(200, 10).standardSlope).toBe(false);
});
test("parking and daylight geometry explicitly separate gross floor area and compliance", () => {
  expect(parkingDimensions(2)).toMatchObject({
    netArea: 25.439999999999998,
    aisleIncluded: false,
  });
  expect(parkingDimensions(1, 2.4, 5.3, true).width).toBeCloseTo(3.6);
  expect(daylightSpacing(24, 45).spacing).toBeCloseTo(24);
  expect(daylightSpacing(24, 1.5, "coefficient").spacing).toBe(36);
  expect(() => daylightSpacing(24, 90)).toThrow();
  expect(() => stairDimensions(-1, 175, 260)).toThrow();
});
