export function parseInteger(text: string) {
  const raw = text.trim();
  if (raw.length > 320 || !/^[-+]?(?:\d+|0x[0-9a-f]+)$/i.test(raw))
    throw new Error("请输入不超过 300 位的整数（十进制 / 0x 十六进制）。");
  const sign = raw.startsWith("-") ? -1n : 1n;
  return sign * BigInt(raw.replace(/^[-+]/, ""));
}
const mod = (a: bigint, n: bigint) => ((a % n) + n) % n;
export function modPow(base: bigint, exponent: bigint, modulus: bigint) {
  if (modulus <= 0n || exponent < 0n || exponent.toString(2).length > 4096)
    throw new Error("模数须为正，指数须为非负且不超过 4096 位。");
  let out = 1n % modulus,
    a = mod(base, modulus),
    b = exponent;
  while (b) {
    if (b & 1n) out = (out * a) % modulus;
    a = (a * a) % modulus;
    b >>= 1n;
  }
  return out;
}
export function extendedGcd(a: bigint, b: bigint) {
  let r = a,
    s = 1n,
    t = 0n,
    rr = b,
    ss = 0n,
    tt = 1n;
  while (rr !== 0n) {
    const q = r / rr;
    [r, rr] = [rr, r - q * rr];
    [s, ss] = [ss, s - q * ss];
    [t, tt] = [tt, t - q * tt];
  }
  if (r < 0n) {
    r = -r;
    s = -s;
    t = -t;
  }
  return { gcd: r, x: s, y: t };
}
export function modInverse(a: bigint, n: bigint) {
  if (n <= 1n) throw new Error("逆元模数必须大于 1。");
  const result = extendedGcd(a, n);
  if (result.gcd !== 1n) throw new Error("两数不互素，模逆元不存在。");
  return mod(result.x, n);
}
export function chineseRemainder(
  equations: { remainder: bigint; modulus: bigint }[],
) {
  if (!equations.length || equations.length > 12)
    throw new Error("请输入 1–12 个同余方程。");
  let value = 0n,
    modulus = 1n;
  for (const next of equations) {
    if (next.modulus <= 0n) throw new Error("模数必须为正。");
    const { gcd, x } = extendedGcd(modulus, next.modulus),
      delta = next.remainder - value;
    if (delta % gcd !== 0n) throw new Error("同余条件不相容，无解。");
    const reduced = next.modulus / gcd,
      step = mod((delta / gcd) * x, reduced);
    value += modulus * step;
    modulus *= reduced;
    value = mod(value, modulus);
  }
  return { value, modulus };
}
function smallPrime(n: bigint) {
  if (n < 3n || n > 1000000n || n % 2n === 0n) return false;
  for (let i = 3n; i * i <= n; i += 2n) if (n % i === 0n) return false;
  return true;
}
export function smallRSA(p: bigint, q: bigint, e: bigint, message: bigint) {
  if (p === q || !smallPrime(p) || !smallPrime(q))
    throw new Error("p、q 须为不同的奇素数，范围 3–1,000,000。");
  const n = p * q,
    phi = (p - 1n) * (q - 1n);
  if (e <= 1n || e >= phi) throw new Error("要求 1 < e < φ(n)。");
  if (message < 0n || message >= n)
    throw new Error("消息整数必须满足 0 ≤ m < n。");
  const d = modInverse(e, phi),
    cipher = modPow(message, e, n),
    decrypted = modPow(cipher, d, n);
  return { n, phi, d, cipher, decrypted };
}
export function endianBytes(text: string) {
  const cleaned = text.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (
    !cleaned ||
    cleaned.length % 2 ||
    cleaned.length > 32 ||
    !/^[0-9a-f]+$/i.test(cleaned)
  )
    throw new Error("请输入 1–16 个完整十六进制字节。");
  const bytes = cleaned.toUpperCase().match(/../g)!,
    reverse = [...bytes].reverse();
  return {
    bytes: bytes.join(" "),
    reversed: reverse.join(" "),
    bigEndian: BigInt("0x" + bytes.join("")),
    littleEndian: BigInt("0x" + reverse.join("")),
  };
}
export type BitOperation =
  | "add"
  | "subtract"
  | "xor"
  | "and"
  | "or"
  | "left"
  | "logicalRight"
  | "arithmeticRight";
export function bitWorkbench(
  a: bigint,
  b: bigint,
  width: 32 | 64,
  signed: boolean,
  operation: BitOperation,
  shift: number,
) {
  if (
    ![32, 64].includes(width) ||
    !Number.isInteger(shift) ||
    shift < 0 ||
    shift >= width
  )
    throw new Error("位宽为 32/64，移位数须为 0 到位宽−1 的整数。");
  const wrap = (v: bigint) => BigInt.asUintN(width, v),
    interpret = (v: bigint) => (signed ? BigInt.asIntN(width, v) : wrap(v)),
    ua = wrap(a),
    ub = wrap(b),
    aa = interpret(a),
    bb = interpret(b),
    min = signed ? -(1n << BigInt(width - 1)) : 0n,
    max = signed ? (1n << BigInt(width - 1)) - 1n : (1n << BigInt(width)) - 1n;
  let raw: bigint;
  switch (operation) {
    case "add":
      raw = aa + bb;
      break;
    case "subtract":
      raw = aa - bb;
      break;
    case "xor":
      raw = ua ^ ub;
      break;
    case "and":
      raw = ua & ub;
      break;
    case "or":
      raw = ua | ub;
      break;
    case "left":
      raw = aa << BigInt(shift);
      break;
    case "logicalRight":
      raw = ua >> BigInt(shift);
      break;
    case "arithmeticRight":
      raw = BigInt.asIntN(width, a) >> BigInt(shift);
      break;
    default:
      throw new Error("位操作无效。");
  }
  const arithmetic = ["add", "subtract", "left"].includes(operation),
    unsignedResult = wrap(raw),
    signedResult = BigInt.asIntN(width, raw);
  return {
    inputA: aa,
    inputB: bb,
    inputOverflow: a < min || a > max || b < min || b > max,
    raw,
    unsignedResult,
    signedResult,
    overflow: arithmetic && (raw < min || raw > max),
    hex: unsignedResult
      .toString(16)
      .padStart(width / 4, "0")
      .toUpperCase(),
    bits: unsignedResult.toString(2).padStart(width, "0"),
    min,
    max,
  };
}
