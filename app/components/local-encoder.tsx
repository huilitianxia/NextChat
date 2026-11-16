"use client";
import { useState } from "react";
import { CampusDialog } from "./campus-dialog";
import styles from "./campus.module.scss";
export default function LocalEncoder({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState(""),
    [key, setKey] = useState(""),
    [output, setOutput] = useState(""),
    [operation, setOperation] = useState("base64-encode"),
    [error, setError] = useState("");
  async function run() {
    setError("");
    try {
      if (input.length > 1000000)
        throw new Error("请将输入限制在 1,000,000 字符以内。");
      const bytes = new TextEncoder().encode(input),
        hex = (data: Uint8Array) =>
          Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
      const unhex = (text: string) => {
        const value = text.replace(/\s/g, "");
        if (!/^(?:[a-f\d]{2})*$/i.test(value))
          throw new Error("Hex 必须由完整的两位十六进制字节组成");
        return Uint8Array.from(value.match(/../g) || [], (x) =>
          parseInt(x, 16),
        );
      };
      const decode = (data: Uint8Array) =>
        new TextDecoder("utf-8", { fatal: true }).decode(data);
      const binary = (data: Uint8Array) =>
        Array.from(data, (x) => String.fromCharCode(x)).join("");
      let value = "";
      if (operation === "base64-encode") value = btoa(binary(bytes));
      if (operation === "base64-decode")
        value = decode(
          Uint8Array.from(
            atob(input.replace(/-/g, "+").replace(/_/g, "/")),
            (x) => x.charCodeAt(0),
          ),
        );
      if (operation === "hex-encode") value = hex(bytes);
      if (operation === "hex-decode") value = decode(unhex(input));
      if (operation === "url-encode") value = encodeURIComponent(input);
      if (operation === "url-decode") value = decodeURIComponent(input);
      if (operation === "jwt") {
        const parts = input.trim().split(".");
        if (parts.length !== 3) throw new Error("JWT 应有三段");
        const part = (s: string) =>
          JSON.parse(
            decode(
              Uint8Array.from(
                atob(s.replace(/-/g, "+").replace(/_/g, "/")),
                (c) => c.charCodeAt(0),
              ),
            ),
          );
        value = JSON.stringify(
          {
            header: part(parts[0]),
            payload: part(parts[1]),
            note: "仅解码，未验证签名",
          },
          null,
          2,
        );
      }
      if (operation.startsWith("xor")) {
        const k = new TextEncoder().encode(key);
        if (!k.length) throw new Error("请填写 XOR 密钥");
        const source = operation === "xor-encode" ? bytes : unhex(input);
        const transformed = source.map((b, i) => b ^ k[i % k.length]);
        value =
          operation === "xor-encode" ? hex(transformed) : decode(transformed);
      }
      if (operation === "sha256")
        value = hex(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        );
      if (operation === "md5") {
        const { default: SparkMD5 } = await import("spark-md5");
        value = SparkMD5.hash(input);
      }
      setOutput(value);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <CampusDialog title="本地编码工具" onClose={onClose}>
      <p className={styles.muted}>内容只在浏览器中处理，不会发往模型。</p>
      <label className={styles.field}>
        操作
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
        >
          {[
            ["base64-encode", "Base64 编码"],
            ["base64-decode", "Base64 解码"],
            ["hex-encode", "Hex 编码"],
            ["hex-decode", "Hex 解码"],
            ["url-encode", "URL 编码"],
            ["url-decode", "URL 解码"],
            ["jwt", "JWT 解码（不验签）"],
            ["xor-encode", "XOR 编码 → Hex"],
            ["xor-decode", "XOR 解码 ← Hex"],
            ["md5", "MD5"],
            ["sha256", "SHA-256"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {operation.startsWith("xor") && (
        <label className={styles.field}>
          XOR 密钥
          <input value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
      )}
      <label className={styles.field}>
        输入
        <textarea value={input} onChange={(e) => setInput(e.target.value)} />
      </label>
      <div className={styles.toolbar}>
        <button onClick={run}>执行</button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <label className={styles.field}>
        结果
        <textarea readOnly value={output} />
      </label>
    </CampusDialog>
  );
}
