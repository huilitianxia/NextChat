export type DecodePreview = {
  name: string;
  ok: boolean;
  text: string;
  hex?: string;
};
export function caesar(text: string, shift: number) {
  return text.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(
      base + ((((c.charCodeAt(0) - base - shift) % 26) + 26) % 26),
    );
  });
}
export function railFenceDecode(text: string, rails: number) {
  if (!Number.isInteger(rails) || rails < 2 || rails > 20)
    throw new Error("栅栏数需要 2–20。");
  const chars = Array.from(text),
    pattern = chars.map((_, i) => {
      const p = i % (2 * rails - 2);
      return p < rails ? p : 2 * rails - 2 - p;
    }),
    buckets = Array.from({ length: rails }, () => [] as string[]);
  let pos = 0;
  for (let r = 0; r < rails; r++) {
    const count = pattern.filter((p) => p === r).length;
    buckets[r] = chars.slice(pos, pos + count);
    pos += count;
  }
  const indices = Array(rails).fill(0);
  return pattern.map((r) => buckets[r][indices[r]++]).join("");
}
export function decodeBase32(input: string) {
  const text = input.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z2-7]*={0,6}$/.test(text)) throw new Error("Base32 字符无效。");
  const core = text.replace(/=+$/, "");
  if (
    ![0, 2, 4, 5, 7].includes(core.length % 8) ||
    (text.includes("=") &&
      (text.length % 8 !== 0 ||
        text.length - core.length !==
          ({ 2: 6, 4: 4, 5: 3, 7: 1 } as Record<number, number>)[
            core.length % 8
          ]))
  )
    throw new Error("Base32 长度无效。");
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const c of core) {
    value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 255);
    }
    value &= (1 << bits) - 1;
  }
  if (value) throw new Error("Base32 尾部填充位无效。");
  return new Uint8Array(out);
}
export function decodeBase58(text: string) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (!text || text.length > 8000) throw new Error("Base58 长度无效。");
  let value = 0n;
  for (const c of text) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Base58 字符无效。");
    value = value * 58n + BigInt(n);
  }
  const out: number[] = [];
  while (value) {
    out.push(Number(value & 255n));
    value >>= 8n;
  }
  for (const c of text) {
    if (c !== "1") break;
    out.push(0);
  }
  return new Uint8Array(out.reverse());
}
export function decodeBase64(input: string) {
  let text = input.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 === 1)
    throw new Error("Base64 格式无效。");
  if (text.includes("=") && text.length % 4 !== 0)
    throw new Error("Base64 填充无效。");
  text = text.padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export function decodeBase85(
  input: string,
  variant: "ascii85" | "rfc1924" = "ascii85",
) {
  let text = input.replace(/\s/g, "");
  if (variant === "ascii85" && text.startsWith("<~")) {
    if (!text.endsWith("~>")) throw new Error("Ascii85 包装不完整。");
    text = text.slice(2, -2);
  }
  const alphabet =
      variant === "ascii85"
        ? Array.from({ length: 85 }, (_, i) =>
            String.fromCharCode(33 + i),
          ).join("")
        : "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~",
    out: number[] = [];
  let group: number[] = [];
  function flush(length: number) {
    if (length === 1) throw new Error("Base85 尾组无效。");
    while (group.length < 5) group.push(84);
    const value = group.reduce((v, n) => v * 85 + n, 0);
    if (value > 0xffffffff) throw new Error("Base85 组溢出。");
    const bytes = [24, 16, 8, 0].map((s) => Math.floor(value / 2 ** s) % 256);
    out.push(...bytes.slice(0, length - 1));
    group = [];
  }
  for (const c of text) {
    if (variant === "ascii85" && c === "z") {
      if (group.length) throw new Error("Ascii85 z 位置无效。");
      out.push(0, 0, 0, 0);
      continue;
    }
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Base85 字符无效。");
    group.push(n);
    if (group.length === 5) flush(5);
  }
  if (group.length) flush(group.length);
  return new Uint8Array(out);
}
export function identifyHash(text: string) {
  const value = text.trim(),
    matches: string[] = [];
  if (/^[a-f\d]{32}$/i.test(value))
    matches.push("32 位十六进制：可能为 MD5（也可能是其他摘要 / 标识）");
  if (/^[a-f\d]{40}$/i.test(value)) matches.push("40 位十六进制：可能为 SHA-1");
  if (/^[a-f\d]{64}$/i.test(value))
    matches.push("64 位十六进制：可能为 SHA-256");
  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value))
    matches.push("bcrypt 结构");
  if (/^[\w-]+\.[\w-]+\.[\w-]*$/.test(value))
    matches.push("JWT 三段结构；签名未验证");
  return matches;
}
function bytesPreview(name: string, fn: () => Uint8Array): DecodePreview {
  try {
    const bytes = fn();
    let text = "";
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[\x00-\x08\x0e-\x1f]/.test(text)) text = "[二进制数据]";
    } catch {
      text = "[非 UTF-8 二进制]";
    }
    return {
      name,
      ok: true,
      text: text.slice(0, 2048),
      hex: [...bytes.slice(0, 64)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" "),
    };
  } catch (e) {
    return { name, ok: false, text: (e as Error).message };
  }
}
export function cipherWaterfall(input: string) {
  if (input.length > 8000) throw new Error("最多分析 8,000 字符。");
  if (!input) return [];
  const compact = input.trim();
  const results = [
    bytesPreview("Base32", () => decodeBase32(compact)),
    bytesPreview("Base58 Bitcoin", () => decodeBase58(compact)),
    bytesPreview("Base64 / URL-safe", () => decodeBase64(compact)),
    bytesPreview("Base85 Ascii85", () => decodeBase85(compact)),
    bytesPreview("Base85 RFC1924", () => decodeBase85(compact, "rfc1924")),
    { name: "ROT13", ok: true, text: caesar(input, 13) },
  ];
  for (let shift = 1; shift <= 25; shift++)
    results.push({
      name: `Caesar −${shift}`,
      ok: true,
      text: caesar(input, shift).slice(0, 2048),
    });
  for (let rails = 2; rails <= 8; rails++)
    results.push({
      name: `Rail Fence ${rails} 轨`,
      ok: true,
      text: railFenceDecode(input, rails).slice(0, 2048),
    });
  if (identifyHash(compact).some((s) => s.startsWith("JWT")))
    results.push(
      bytesPreview("JWT header（未验证）", () =>
        decodeBase64(compact.split(".")[0]),
      ),
      bytesPreview("JWT payload（未验证）", () =>
        decodeBase64(compact.split(".")[1]),
      ),
    );
  return results;
}
