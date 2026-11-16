import {
  parseInteger,
  modPow,
  extendedGcd,
  modInverse,
  chineseRemainder,
  smallRSA,
  endianBytes,
  bitWorkbench,
} from "../app/utils/junior-crypto";
test("BigInt parser retains 64-bit precision and signed hex", () => {
  expect(parseInteger("18446744073709551615")).toBe((1n << 64n) - 1n);
  expect(parseInteger("-0xFF")).toBe(-255n);
  expect(parseInteger("+42")).toBe(42n);
});
test.each(["", "1.2", "2e3", "0xZZ", "1".repeat(321)])(
  "invalid integer %p",
  (s) => expect(() => parseInteger(s)).toThrow(),
);
test.each([
  [7n, 560n, 561n, 1n],
  [-2n, 3n, 5n, 2n],
  [4n, 13n, 497n, 445n],
  [3n, 0n, 7n, 1n],
  [0n, 0n, 1n, 0n],
])("modular exponentiation known result %p", (a, b, n, result) =>
  expect(modPow(a, b, n)).toBe(result),
);
test("modular exponent rejects negative powers and zero modulus", () => {
  expect(() => modPow(2n, -1n, 3n)).toThrow();
  expect(() => modPow(2n, 1n, 0n)).toThrow();
});
test.each([
  [17n, 3120n],
  [240n, 46n],
  [-15n, 6n],
  [0n, 8n],
])("Bezout identity and gcd sign %p", (a, b) => {
  const r = extendedGcd(a, b);
  expect(a * r.x + b * r.y).toBe(r.gcd);
  expect(r.gcd).toBeGreaterThanOrEqual(0n);
});
test("modular inverse positive normalization and non-coprime rejection", () => {
  expect(modInverse(17n, 3120n)).toBe(2753n);
  expect(modInverse(-3n, 11n)).toBe(7n);
  expect(() => modInverse(6n, 9n)).toThrow();
  expect(() => modInverse(1n, 1n)).toThrow();
});
test("CRT merges coprime and compatible non-coprime systems", () => {
  expect(
    chineseRemainder([
      { remainder: 2n, modulus: 3n },
      { remainder: 3n, modulus: 5n },
      { remainder: 2n, modulus: 7n },
    ]),
  ).toEqual({ value: 23n, modulus: 105n });
  expect(
    chineseRemainder([
      { remainder: 2n, modulus: 4n },
      { remainder: 6n, modulus: 8n },
    ]),
  ).toEqual({ value: 6n, modulus: 8n });
  expect(chineseRemainder([{ remainder: -1n, modulus: 5n }])).toEqual({
    value: 4n,
    modulus: 5n,
  });
});
test("CRT rejects inconsistent or invalid systems", () => {
  expect(() =>
    chineseRemainder([
      { remainder: 1n, modulus: 2n },
      { remainder: 0n, modulus: 4n },
    ]),
  ).toThrow(/不相容/);
  expect(() => chineseRemainder([])).toThrow();
  expect(() => chineseRemainder([{ remainder: 1n, modulus: 0n }])).toThrow();
});
test("classic RSA key and ciphertext agree with known tutorial", () =>
  expect(smallRSA(61n, 53n, 17n, 65n)).toEqual({
    n: 3233n,
    phi: 3120n,
    d: 2753n,
    cipher: 2790n,
    decrypted: 65n,
  }));
test.each([
  [61n, 61n, 17n, 1n],
  [9n, 53n, 17n, 1n],
  [61n, 53n, 12n, 1n],
  [61n, 53n, 17n, 3233n],
  [2n, 53n, 17n, 1n],
])("RSA invalid parameter set %p", (p, q, e, m) =>
  expect(() => smallRSA(p, q, e, m)).toThrow(),
);
test("byte endianness keeps leading zeros and full 64-bit precision", () => {
  expect(endianBytes("00 01 02 03")).toEqual({
    bytes: "00 01 02 03",
    reversed: "03 02 01 00",
    bigEndian: 66051n,
    littleEndian: 50462976n,
  });
  expect(endianBytes("FF FF FF FF FF FF FF FF").bigEndian).toBe(
    (1n << 64n) - 1n,
  );
  expect(() => endianBytes("ABC")).toThrow();
  expect(() => endianBytes("GG")).toThrow();
});
test("signed and unsigned overflow have distinct ranges", () => {
  expect(bitWorkbench(2147483647n, 1n, 32, true, "add", 0)).toMatchObject({
    overflow: true,
    signedResult: -2147483648n,
    unsignedResult: 2147483648n,
  });
  expect(bitWorkbench(4294967295n, 1n, 32, false, "add", 0)).toMatchObject({
    overflow: true,
    unsignedResult: 0n,
  });
  expect(bitWorkbench(0n, 1n, 64, false, "subtract", 0)).toMatchObject({
    overflow: true,
    unsignedResult: (1n << 64n) - 1n,
    signedResult: -1n,
  });
});
test("64-bit shifts, XOR masks and sign extension retain exact bits", () => {
  expect(
    bitWorkbench(-1n, 0n, 64, true, "logicalRight", 1).unsignedResult,
  ).toBe((1n << 63n) - 1n);
  expect(
    bitWorkbench(-1n, 0n, 64, true, "arithmeticRight", 1).signedResult,
  ).toBe(-1n);
  expect(bitWorkbench(1n, 0n, 64, false, "left", 63).unsignedResult).toBe(
    1n << 63n,
  );
  expect(
    bitWorkbench(0xff00n, 0xf0f0n, 32, false, "xor", 0).unsignedResult,
  ).toBe(0x0ff0n);
  expect(
    bitWorkbench(0xff00n, 0xf0f0n, 32, false, "and", 0).unsignedResult,
  ).toBe(0xf000n);
  expect(
    bitWorkbench(0xff00n, 0xf0f0n, 32, false, "or", 0).unsignedResult,
  ).toBe(0xfff0n);
});
test("input truncation is visible and shifts are range checked", () => {
  expect(bitWorkbench(1n << 64n, 0n, 64, false, "add", 0).inputOverflow).toBe(
    true,
  );
  expect(() => bitWorkbench(1n, 0n, 32, true, "left", 32)).toThrow();
});
