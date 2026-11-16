/** @jest-environment node */
import { webcrypto } from "node:crypto";
import {
  base64Bytes,
  bytesBase64,
  decryptVault,
  encryptVault,
  VAULT_ITERATIONS,
} from "../app/utils/vault-crypto";
const api = webcrypto as unknown as Crypto,
  password = "正确口令🔑 2026",
  payload = { notes: [{ content: "中文 · $x^2$" }], sessions: [], macros: [] };
let envelope: Awaited<ReturnType<typeof encryptVault>>;
beforeAll(async () => {
  envelope = await encryptVault(payload, password, api);
});
test("real PBKDF2 + AES-GCM round trip preserves Unicode data", async () => {
  expect(envelope).toMatchObject({
    format: "campus-vault",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    cipher: "AES-256-GCM",
  });
  expect(VAULT_ITERATIONS).toBe(600000);
  expect(base64Bytes(envelope.iv)).toHaveLength(12);
  expect(base64Bytes(envelope.salt)).toHaveLength(16);
  expect(JSON.stringify(envelope)).not.toContain("中文");
  expect(await decryptVault(envelope, password, api)).toEqual(payload);
});
test("independent encryption has unique salt, IV and ciphertext", async () => {
  const other = await encryptVault(payload, password, api);
  expect(other.salt).not.toBe(envelope.salt);
  expect(other.iv).not.toBe(envelope.iv);
  expect(other.data).not.toBe(envelope.data);
});
test("wrong password rejected", async () => {
  await expect(decryptVault(envelope, "wrong password", api)).rejects.toThrow(
    /口令错误/,
  );
});
test.each(["data", "salt", "iv"] as const)(
  "tampered %s is authenticated",
  async (key) => {
    const bytes = base64Bytes(envelope[key]);
    bytes[0] ^= 1;
    await expect(
      decryptVault({ ...envelope, [key]: bytesBase64(bytes) }, password, api),
    ).rejects.toThrow();
  },
);
test("iteration count is authenticated metadata", async () => {
  await expect(
    decryptVault({ ...envelope, iterations: 600001 }, password, api),
  ).rejects.toThrow();
});
test.each([
  { version: 2 },
  { cipher: "CBC" },
  { iterations: 1 },
  { iterations: 2e9 },
  { salt: "bad" },
  { iv: "bad" },
  { data: "!" },
  { data: "" },
])(
  "malformed envelope rejected without expensive derivation: %p",
  async (patch) => {
    await expect(
      decryptVault({ ...envelope, ...patch }, password, api),
    ).rejects.toThrow();
  },
);
test.each(["", "short", "x".repeat(1025)])(
  "export passphrase bounds enforced",
  async (p) => {
    await expect(encryptVault(payload, p, api)).rejects.toThrow(/口令/);
  },
);
test("missing browser crypto fails clearly", async () => {
  await expect(encryptVault(payload, password, {} as Crypto)).rejects.toThrow(
    /Web Crypto/,
  );
});
test("binary Base64 roundtrip supports large arrays without stack overflow", () => {
  const bytes = Uint8Array.from({ length: 40000 }, (_, i) => i % 256);
  expect(base64Bytes(bytesBase64(bytes))).toEqual(bytes);
  expect(() => base64Bytes("a===")).toThrow();
});
