export const VAULT_ITERATIONS = 600000;
export const VAULT_MAX_BYTES = 50 * 1024 * 1024;
export type VaultEnvelope = {
  format: "campus-vault";
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  cipher: "AES-256-GCM";
  iv: string;
  data: string;
};
export function bytesBase64(bytes: Uint8Array) {
  let str = "";
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
export function base64Bytes(value: string) {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new Error("漫游包编码无效。");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
const metadata = (e: Omit<VaultEnvelope, "data">) =>
  new TextEncoder().encode(
    JSON.stringify({
      format: e.format,
      version: e.version,
      kdf: e.kdf,
      iterations: e.iterations,
      salt: e.salt,
      cipher: e.cipher,
      iv: e.iv,
    }),
  );
function provider(api?: Crypto) {
  const value = api || globalThis.crypto;
  if (!value?.subtle || !value.getRandomValues)
    throw new Error("此浏览器需要 HTTPS 与 Web Crypto 才能加密漫游包。");
  return value;
}
async function keyFor(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  api: Crypto,
) {
  const material = await api.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return api.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptVault(
  payload: unknown,
  passphrase: string,
  api?: Crypto,
): Promise<VaultEnvelope> {
  if (passphrase.length < 8 || passphrase.length > 1024)
    throw new Error("漫游口令需要 8–1,024 个字符。");
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > VAULT_MAX_BYTES)
    throw new Error("漫游数据超过 50 MB，请减少选中的会话。");
  const c = provider(api),
    salt = c.getRandomValues(new Uint8Array(16)),
    iv = c.getRandomValues(new Uint8Array(12)),
    header: Omit<VaultEnvelope, "data"> = {
      format: "campus-vault",
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: VAULT_ITERATIONS,
      salt: bytesBase64(salt),
      cipher: "AES-256-GCM",
      iv: bytesBase64(iv),
    };
  const key = await keyFor(passphrase, salt, header.iterations, c),
    encrypted = await c.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: metadata(header), tagLength: 128 },
      key,
      bytes,
    );
  return { ...header, data: bytesBase64(new Uint8Array(encrypted)) };
}
export async function decryptVault(
  input: unknown,
  passphrase: string,
  api?: Crypto,
): Promise<unknown> {
  const e = input as VaultEnvelope;
  if (
    !e ||
    e.format !== "campus-vault" ||
    e.version !== 1 ||
    e.kdf !== "PBKDF2-SHA256" ||
    e.cipher !== "AES-256-GCM" ||
    !Number.isInteger(e.iterations) ||
    e.iterations < 100000 ||
    e.iterations > 2000000 ||
    typeof e.salt !== "string" ||
    e.salt.length !== 24 ||
    typeof e.iv !== "string" ||
    e.iv.length !== 16 ||
    typeof e.data !== "string" ||
    e.data.length > ((VAULT_MAX_BYTES + 16) * 4) / 3 + 4 ||
    passphrase.length > 1024
  )
    throw new Error("漫游包格式、版本或大小无效。");
  const salt = base64Bytes(e.salt),
    iv = base64Bytes(e.iv),
    data = base64Bytes(e.data);
  if (salt.length !== 16 || iv.length !== 12 || data.length < 16)
    throw new Error("漫游包参数无效。");
  try {
    const c = provider(api),
      key = await keyFor(passphrase, salt, e.iterations, c),
      plain = await c.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: metadata(e), tagLength: 128 },
        key,
        data,
      );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    throw new Error("口令错误，或漫游包已损坏 / 被修改。");
  }
}
