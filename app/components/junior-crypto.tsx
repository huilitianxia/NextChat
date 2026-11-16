"use client";
import { useState } from "react";
import {
  parseInteger,
  modPow,
  modInverse,
  extendedGcd,
  chineseRemainder,
  smallRSA,
  endianBytes,
  bitWorkbench,
  BitOperation,
} from "../utils/junior-crypto";
import {
  calculate,
  NumberFields,
  Section,
  Result,
  Reference,
  Note,
  Select,
  TextField,
  styles,
  junior,
} from "./junior-shared";
export default function JuniorCrypto() {
  const [mod, setMod] = useState({ a: "7", b: "560", n: "561" }),
    [inv, setInv] = useState({ a: "17", n: "3120" }),
    [rsa, setRsa] = useState({ p: "61", q: "53", e: "17", message: "65" }),
    [crt, setCrt] = useState("2 3\n3 5\n2 7"),
    [bytes, setBytes] = useState("12 34 56 78"),
    [a, setA] = useState("2147483647"),
    [b, setB] = useState("1"),
    [width, setWidth] = useState<32 | 64>(32),
    [signed, setSigned] = useState(true),
    [operation, setOperation] = useState<BitOperation>("add"),
    [shift, setShift] = useState(1);
  const m = calculate(() =>
      modPow(parseInteger(mod.a), parseInteger(mod.b), parseInteger(mod.n)),
    ),
    i = calculate(() => ({
      ...extendedGcd(parseInteger(inv.a), parseInteger(inv.n)),
      inverse: modInverse(parseInteger(inv.a), parseInteger(inv.n)),
    })),
    r = calculate(() =>
      smallRSA(
        parseInteger(rsa.p),
        parseInteger(rsa.q),
        parseInteger(rsa.e),
        parseInteger(rsa.message),
      ),
    ),
    c = calculate(() =>
      chineseRemainder(
        crt
          .trim()
          .split(/\n/)
          .map((line) => {
            const p = line.trim().split(/[\s,]+/);
            if (p.length !== 2) throw new Error("每行请输入：余数 模数。");
            return {
              remainder: parseInteger(p[0]),
              modulus: parseInteger(p[1]),
            };
          }),
      ),
    ),
    endian = calculate(() => endianBytes(bytes)),
    bit = calculate(() =>
      bitWorkbench(
        parseInteger(a),
        parseInteger(b),
        width,
        signed,
        operation,
        shift,
      ),
    );
  const mt =
      m.value !== null ? `${mod.a}^${mod.b} mod ${mod.n} = ${m.value}` : "",
    it = i.value
      ? `扩展欧几里得：${inv.a}·(${i.value.x}) + ${inv.n}·(${i.value.y}) = ${i.value.gcd}。\n${inv.a}⁻¹ mod ${inv.n} = ${i.value.inverse}。`
      : "",
    rt = r.value
      ? `p=${rsa.p}，q=${rsa.q}，e=${rsa.e}，m=${rsa.message}。\nn=pq=${r.value.n}；φ(n)=${r.value.phi}；d=e⁻¹ modφ=${r.value.d}。\n加密 c=m^e mod n=${r.value.cipher}；解密 m=c^d mod n=${r.value.decrypted}。`
      : "",
    ct = c.value
      ? `${crt
          .split("\n")
          .map((line) => "余数 / 模数：" + line)
          .join("\n")}\n通解 x ≡ ${c.value.value} (mod ${c.value.modulus})。`
      : "",
    et = endian.value
      ? `内存字节（低地址→高地址）：${endian.value.bytes}。\n按大端无符号整数解释：${endian.value.bigEndian}；按小端解释：${endian.value.littleEndian}。\n同一数值切换端序的字节排列：${endian.value.reversed}。`
      : "",
    bt = bit.value
      ? `${width} 位${
          signed ? "有符号" : "无符号"
        }，操作=${operation}；输入 A=${a}，B=${b}，移位数=${shift}。\n归一化 A=${
          bit.value.inputA
        }，B=${bit.value.inputB}；原输入${
          bit.value.inputOverflow
            ? "超出所选表示范围，已按位宽截断"
            : "在表示范围内"
        }。\n数学中间结果=${bit.value.raw}；运算溢出=${
          bit.value.overflow ? "是" : "否"
        }。\n存储后无符号=${bit.value.unsignedResult}；有符号=${
          bit.value.signedResult
        }；HEX=${bit.value.hex}。\n表示范围 [${bit.value.min}, ${
          bit.value.max
        }]。`
      : "";
  const fields = (
    value: Record<string, string>,
    set: (v: any) => void,
    labels: Record<string, string>,
  ) => (
    <div className={styles.grid}>
      {Object.entries(value).map(([key, text]) => (
        <TextField
          key={key}
          label={labels[key]}
          value={text}
          set={(s) => set({ ...value, [key]: s })}
          max={320}
        />
      ))}
    </div>
  );
  return (
    <div className={styles.tools}>
      <Section
        title="数论 · 模幂与扩展欧几里得"
        preset={() => {
          setMod({ a: "7", b: "560", n: "561" });
          setInv({ a: "17", n: "3120" });
        }}
      >
        {fields(mod, setMod, {
          a: "模幂底数 a",
          b: "模幂指数 b",
          n: "模幂模数 n",
        })}
        <Result text={mt} error={m.error} />
        {mt && <Reference title="模幂" text={mt} />}
        {fields(inv, setInv, { a: "求逆元素 e", n: "求逆模数 φ / n" })}
        <Result text={it} error={i.error} />
        {it && <Reference title="模逆元" text={it} />}
      </Section>
      <Section
        title="小参数 RSA · 密钥推导与往返"
        preset={() => setRsa({ p: "61", q: "53", e: "17", message: "65" })}
      >
        {fields(rsa, setRsa, {
          p: "素数 p",
          q: "素数 q",
          e: "公钥指数 e",
          message: "消息整数 m",
        })}
        <Result text={rt} error={r.error} />
        {r.value && (
          <Reference
            title="教学 RSA"
            text={rt + "\n小参数、无填充的教学示例，禁止用于实际加密。"}
          />
        )}
        <Note>
          限制 p、q 为 3～1,000,000 的不同奇素数。此处原始 RSA
          仅演示数论，真实密码系统还需要安全参数、填充与成熟实现。
        </Note>
      </Section>
      <Section title="中国剩余定理 · 广义同余组">
        <label>
          同余条件（每行：余数 模数）
          <textarea
            aria-label="同余条件"
            value={crt}
            rows={4}
            maxLength={2000}
            onChange={(e) => setCrt(e.target.value)}
          />
        </label>
        <Result text={ct} error={c.error} />
        {c.value && <Reference title="广义 CRT" text={ct} />}
        <Note>
          支持模数非互素的相容系统；结果周期为合并模数的最小公倍数，不相容时显示无解。
        </Note>
      </Section>
      <Section title="端序 · 十六进制字节视图">
        <TextField
          label="内存字节（低地址到高地址）"
          value={bytes}
          set={setBytes}
          max={80}
        />
        <Result text={et} error={endian.error} />
        {endian.value && <Reference title="大小端解释" text={et} />}
      </Section>
      <Section
        title="整数溢出 · 32 / 64 位位运算"
        preset={() => {
          setA("2147483647");
          setB("1");
          setWidth(32);
          setSigned(true);
          setOperation("add");
          setShift(1);
        }}
      >
        <div className={styles.grid}>
          <Select
            label="整数位宽"
            value={String(width)}
            set={(v) => setWidth(Number(v) as 32 | 64)}
            options={[
              ["32", "32 位"],
              ["64", "64 位"],
            ]}
          />
          <Select
            label="整数解释"
            value={signed ? "signed" : "unsigned"}
            set={(v) => setSigned(v === "signed")}
            options={[
              ["signed", "有符号补码"],
              ["unsigned", "无符号"],
            ]}
          />
          <TextField
            label="整数 A（十进制 / 0x）"
            value={a}
            set={setA}
            max={320}
          />
          <TextField
            label="整数 B（十进制 / 0x）"
            value={b}
            set={setB}
            max={320}
          />
          <Select
            label="位运算"
            value={operation}
            set={setOperation}
            options={[
              ["add", "加法 A+B"],
              ["subtract", "减法 A−B"],
              ["xor", "按位 XOR"],
              ["and", "按位 AND"],
              ["or", "按位 OR"],
              ["left", "左移 A<<s"],
              ["logicalRight", "逻辑右移（零填充）"],
              ["arithmeticRight", "算术右移（符号扩展）"],
            ]}
          />
          <NumberFields
            value={{ shift }}
            set={(v) => setShift(v.shift)}
            fields={[["shift", "移位位数 s"]]}
          />
        </div>
        <Result text={bt} error={bit.error} />
        {bit.value && (
          <>
            <div className={junior.bitrow} aria-label="运算后比特">
              {bit.value.bits.split("").map((n, i) => (
                <span key={i}>{n}</span>
              ))}
            </div>
            <Reference title="整数位运算" text={bt} />
          </>
        )}
        <Note>
          输入先归一化到选定位宽；加、减、左移检查所选整数范围溢出。算术右移始终按补码符号扩展；逻辑右移始终零填充。BigInt
          计算保留全部 64 位。
        </Note>
      </Section>
    </div>
  );
}
