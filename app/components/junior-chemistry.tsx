"use client";
import { useState } from "react";
import {
  nernst,
  bufferRecipe,
  BUFFER_EXAMPLE,
  titrationCurve,
  titrationPH,
  arrhenius,
  beerLambert,
} from "../utils/junior-chemistry";
import {
  calculate,
  num,
  NumberFields,
  Section,
  Result,
  Reference,
  Note,
  Select,
  Plot,
  styles,
} from "./junior-shared";
export default function JuniorChemistry() {
  const [n, setN] = useState({
      e0: 0.771,
      temperature: 298.15,
      electrons: 1,
      reduced: 0.01,
      oxidized: 0.1,
    }),
    [activity, setActivity] = useState("activity"),
    [b, setB] = useState(BUFFER_EXAMPLE),
    [t, setT] = useState({
      concentration: 0.1,
      volumeMl: 25,
      titrant: 0.1,
      addedMl: 12.5,
    }),
    [ar, setAr] = useState({
      t1: 298.15,
      k1: 0.001,
      t2: 318.15,
      k2: 0.004,
      targetT: 310.15,
    }),
    [bl, setBl] = useState({
      epsilon: 15000,
      pathCm: 1,
      concentration: 0.00002,
      measuredA: 0.3,
    });
  const potential = calculate(() =>
      nernst(n.e0, n.temperature, n.electrons, n.reduced, n.oxidized),
    ),
    buffer = calculate(() => bufferRecipe(b)),
    curve = calculate(() => titrationCurve({ ...t, pK: b.pK, mode: b.mode })),
    ph = calculate(() =>
      titrationPH({ ...t, pK: b.pK, mode: b.mode }, t.addedMl),
    ),
    rate = calculate(() => arrhenius(ar.t1, ar.k1, ar.t2, ar.k2, ar.targetT)),
    beer = calculate(() =>
      beerLambert(bl.epsilon, bl.pathCm, bl.concentration, bl.measuredA),
    );
  const nText = potential.value
    ? `半反应 Ox + ne⁻ ⇌ Red；E°=${n.e0} V，T=${n.temperature} K，n=${
        n.electrons
      }，aRed=${n.reduced}，aOx=${n.oxidized}（${
        activity === "activity" ? "无量纲活度" : "浓度 / 1 mol·L⁻¹ 近似活度"
      }）。\nQ=${num(potential.value.quotient)}；E = E°−RT/(nF)·lnQ = ${num(
        potential.value.potential,
      )} V。`
    : "";
  const bText = buffer.value
    ? `Henderson–Hasselbalch，25 °C；${
        b.mode === "acid" ? "弱酸 pKa" : "弱碱 pKb"
      }=${b.pK}；目标 pH=${b.pH}，总浓度=${b.total} mol/L，定容=${
        b.volumeMl
      } mL。\n[共轭碱]/[共轭酸]=${num(buffer.value.ratio)}。酸式=${num(
        buffer.value.acidMoles,
      )} mol / ${num(buffer.value.acidMass)} g；碱式=${num(
        buffer.value.baseMoles,
      )} mol / ${num(buffer.value.baseMass)} g。\n若用储备液：酸式 ${
        b.acidStock
      } M 取 ${num(buffer.value.acidMl)} mL；碱式 ${b.baseStock} M 取 ${num(
        buffer.value.baseMl,
      )} mL，再定容至 ${b.volumeMl} mL。${
        buffer.value.inBufferRange
          ? "目标在 pKa±1 常用缓冲区内。"
          : "目标超出 pKa±1，缓冲能力有限，HH 近似应复核。"
      }`
    : "";
  const tText =
    curve.value && ph.value !== null
      ? `一元${b.mode === "acid" ? "弱酸–强碱" : "弱碱–强酸"}滴定，${
          b.mode === "acid" ? "pKa" : "pKb"
        }=${b.pK}，分析物 ${t.concentration} M × ${t.volumeMl} mL，滴定剂 ${
          t.titrant
        } M。\n当前加入 ${t.addedMl} mL，pH=${num(ph.value)}；等当点 ${num(
          curve.value.equivalenceMl,
        )} mL，pH=${num(curve.value.equivalencePH)}；半等当点 pH=${num(
          curve.value.halfPH,
        )}。数值求解质量守恒、电荷平衡与水解离，Kw=1e−14。`
      : "";
  const arText = rate.value
    ? `k₁=${ar.k1} @ ${ar.t1} K，k₂=${ar.k2} @ ${
        ar.t2
      } K（速率常数单位相同）。\nEa = R·ln(k₂/k₁)/(1/T₁−1/T₂) = ${num(
        rate.value.activationKj,
      )} kJ/mol；lnA=${num(rate.value.logA)}；k(${ar.targetT} K)=${num(
        rate.value.predicted,
      )}（与输入 k 同单位）。`
    : "";
  const blText = beer.value
    ? `ε=${bl.epsilon} L·mol⁻¹·cm⁻¹，b=${bl.pathCm} cm，c=${
        bl.concentration
      } mol/L。\nA=εbc=${num(beer.value.absorbance)}；透射率=${num(
        beer.value.transmissionPercent,
      )}%。实测 A=${bl.measuredA} 反推 c=${num(
        beer.value.inferredConcentration,
      )} mol/L。`
    : "";
  return (
    <div className={styles.tools}>
      <Section
        title="能斯特方程 · 电极电势"
        preset={() =>
          setN({
            e0: 0.771,
            temperature: 298.15,
            electrons: 1,
            reduced: 0.01,
            oxidized: 0.1,
          })
        }
      >
        <NumberFields
          value={n}
          set={setN}
          fields={[
            ["e0", "标准电势 E° / V"],
            ["temperature", "温度 T / K"],
            ["electrons", "转移电子数 n"],
            ["reduced", "还原态活度 aRed"],
            ["oxidized", "氧化态活度 aOx"],
          ]}
        />
        <Select
          label="活度输入解释"
          value={activity}
          set={setActivity}
          options={[
            ["activity", "使用无量纲活度"],
            ["concentration", "用 c / c° 近似（c°=1 mol/L）"],
          ]}
        />
        <Result text={nText} error={potential.error} />
        {potential.value && <Reference title="能斯特方程" text={nText} />}
        <Note>
          当前半反应的 Ox、Red 化学计量系数均为 1；其他反应需先换算其实际
          Q。高离子强度时应使用活度系数。
        </Note>
      </Section>
      <Section
        title="缓冲液配方 · Henderson–Hasselbalch"
        preset={() => setB(BUFFER_EXAMPLE)}
      >
        <Select
          label="缓冲体系"
          value={b.mode}
          set={(mode) =>
            setB(
              mode === "acid"
                ? BUFFER_EXAMPLE
                : {
                    ...BUFFER_EXAMPLE,
                    mode: "base",
                    pK: 4.75,
                    pH: 9.25,
                    acidMw: 53.49,
                    baseMw: 17.031,
                  },
            )
          }
          options={[
            ["acid", "弱酸 / 共轭碱（乙酸例）"],
            ["base", "弱碱 / 共轭酸（氨例）"],
          ]}
        />
        <NumberFields
          value={{
            pK: b.pK,
            pH: b.pH,
            total: b.total,
            volumeMl: b.volumeMl,
            acidMw: b.acidMw,
            baseMw: b.baseMw,
            acidStock: b.acidStock,
            baseStock: b.baseStock,
          }}
          set={(v) => setB({ ...b, ...v })}
          fields={[
            ["pK", b.mode === "acid" ? "酸 pKa" : "碱 pKb"],
            ["pH", "目标 pH"],
            ["total", "总分析浓度 / mol·L⁻¹"],
            ["volumeMl", "定容体积 / mL"],
            ["acidMw", "酸式物摩尔质量 / g·mol⁻¹"],
            ["baseMw", "碱式物摩尔质量 / g·mol⁻¹"],
            ["acidStock", "酸式储备液 / mol·L⁻¹"],
            ["baseStock", "碱式储备液 / mol·L⁻¹"],
          ]}
        />
        <Result text={bText} error={buffer.error} />
        {buffer.value && <Reference title="缓冲液配方" text={bText} />}
        <Note>
          质量法与储备液法二选一。质量依据填写的纯物质摩尔质量；水合物、纯度和溶液活度需另行修正，最终使用
          pH 计校准。
        </Note>
      </Section>
      <Section
        title="酸碱滴定 · 质量与电荷平衡曲线"
        preset={() =>
          setT({
            concentration: 0.1,
            volumeMl: 25,
            titrant: 0.1,
            addedMl: 12.5,
          })
        }
      >
        <NumberFields
          value={t}
          set={setT}
          fields={[
            ["concentration", "被滴定液浓度 / mol·L⁻¹"],
            ["volumeMl", "被滴定液体积 / mL"],
            ["titrant", "强滴定剂浓度 / mol·L⁻¹"],
            ["addedMl", "已加入滴定剂 / mL"],
          ]}
        />
        <Note>
          共用上方的弱酸 / 弱碱体系与 pK。绿色区标示 1:10～10:1
          缓冲配比，橙线为等当点。
        </Note>
        <Result text={tText} error={curve.error || ph.error} />
        {curve.value && (
          <Plot
            title="滴定 pH 曲线"
            points={curve.value.points}
            xLabel="加入强滴定剂 / mL"
            yLabel="pH · 25 °C"
            band={[curve.value.bufferStart, curve.value.bufferEnd]}
            markerX={curve.value.equivalenceMl}
          />
        )}
        {tText && <Reference title="酸碱滴定" text={tText} />}
      </Section>
      <Section
        title="Arrhenius · 双温度活化能"
        preset={() =>
          setAr({
            t1: 298.15,
            k1: 0.001,
            t2: 318.15,
            k2: 0.004,
            targetT: 310.15,
          })
        }
      >
        <NumberFields
          value={ar}
          set={setAr}
          fields={[
            ["t1", "T₁ / K"],
            ["k1", "k₁（同单位）"],
            ["t2", "T₂ / K"],
            ["k2", "k₂（同单位）"],
            ["targetT", "预测温度 / K"],
          ]}
        />
        <Result text={arText} error={rate.error} />
        {rate.value && <Reference title="Arrhenius" text={arText} />}
        <Note>
          假设同一反应机理和温区内 Ea 不变；负的表观活化能需结合机理解释。
        </Note>
      </Section>
      <Section title="Beer–Lambert · 吸光度与反算浓度">
        <NumberFields
          value={bl}
          set={setBl}
          fields={[
            ["epsilon", "摩尔吸光系数 ε / L·mol⁻¹·cm⁻¹"],
            ["pathCm", "光程 b / cm"],
            ["concentration", "样品浓度 c / mol·L⁻¹"],
            ["measuredA", "反算用实测吸光度 A"],
          ]}
        />
        <Result text={blText} error={beer.error} />
        {beer.value && <Reference title="Beer–Lambert" text={blText} />}
        <Note>
          适用于经空白校正的线性吸收范围，忽略散射、杂散光和化学平衡变化。
        </Note>
      </Section>
    </div>
  );
}
