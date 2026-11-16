"use client";
import { useState } from "react";
import {
  controlSystem,
  converter,
  powerFactorCorrection,
} from "../utils/junior-electrical";
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
export default function JuniorElectrical() {
  const [control, setControl] = useState({ wn: 5, zeta: 0.5 }),
    [dc, setDc] = useState({
      vin: 24,
      vout: 12,
      current: 2,
      frequency: 100000,
      rippleFraction: 0.3,
      voltageRipple: 0.05,
    }),
    [mode, setMode] = useState<"buck" | "boost">("buck"),
    [pf, setPf] = useState({
      powerW: 10000,
      lineVoltage: 400,
      frequency: 50,
      initial: 0.75,
      target: 0.95,
    }),
    [connection, setConnection] = useState<"star" | "delta">("delta");
  const c = calculate(() => controlSystem(control.wn, control.zeta)),
    d = calculate(() =>
      converter(
        mode,
        dc.vin,
        dc.vout,
        dc.current,
        dc.frequency,
        dc.rippleFraction,
        dc.voltageRipple,
      ),
    ),
    p = calculate(() =>
      powerFactorCorrection(
        pf.powerW,
        pf.lineVoltage,
        pf.frequency,
        pf.initial,
        pf.target,
        connection,
      ),
    );
  const ct = c.value
    ? `G(s)=ωn²/(s²+2ζωn·s+ωn²)，单位直流增益；ωn=${control.wn} rad/s，ζ=${
        control.zeta
      }。\n超调=${num(c.value.overshoot)}%；tp=${
        c.value.peakTime === null ? "无有限峰时" : num(c.value.peakTime) + " s"
      }。\n2% 调节时间=${
        c.value.ts2 === null ? "不收敛" : num(c.value.ts2) + " s"
      }；5%=${
        c.value.ts5 === null ? "不收敛" : num(c.value.ts5) + " s"
      }（最后一次越出误差带求根）。\nMr=${
        c.value.resonantPeak === null ? "无穷大" : num(c.value.resonantPeak)
      }；谐振频率 ωr=${num(c.value.resonantOmega)} rad/s。`
    : "";
  const dt = d.value
    ? `理想 ${mode.toUpperCase()}，Vin=${dc.vin} V，Vout=${dc.vout} V，Iout=${
        dc.current
      } A，fs=${dc.frequency} Hz，ΔIL/IL=${dc.rippleFraction}，ΔVout=${
        dc.voltageRipple
      } V。\nD=${num(d.value.duty)}；电感平均电流=${num(
        d.value.inductorCurrent,
      )} A，纹波峰峰值=${num(d.value.deltaI)} A，峰值=${num(
        d.value.peakCurrent,
      )} A。\nCCM 临界 Lmin=${num(
        d.value.criticalInductance * 1e6,
      )} µH；满足目标纹波 L=${num(d.value.inductance * 1e6)} µH；Cout≥${num(
        d.value.capacitance * 1e6,
      )} µF。`
    : "";
  const pt = p.value
    ? `三相平衡负载 P=${pf.powerW} W，线电压=${pf.lineVoltage} V，f=${
        pf.frequency
      } Hz，功率因数 ${pf.initial}→${pf.target}。\nQc=P(tanφ₁−tanφ₂)=${num(
        p.value.reactive / 1000,
      )} kvar；${connection === "delta" ? "三角形" : "星形"}每相 C=${num(
        p.value.perPhase * 1e6,
      )} µF。\n线电流 ${num(p.value.currentBefore)}→${num(
        p.value.currentAfter,
      )} A。`
    : "";
  return (
    <div className={styles.tools}>
      <Section
        title="二阶控制系统 · 时域与频域"
        preset={() => setControl({ wn: 5, zeta: 0.5 })}
      >
        <NumberFields
          value={control}
          set={setControl}
          fields={[
            ["wn", "自然角频率 ωn / rad·s⁻¹"],
            ["zeta", "阻尼比 ζ"],
          ]}
        />
        <Result text={ct} error={c.error} />
        {c.value && (
          <>
            <Plot
              title="单位阶跃响应"
              points={c.value.points}
              xLabel="时间 / s"
              yLabel="输出 / 单位阶跃"
            />
            <Plot
              title="Bode 幅值"
              points={c.value.bode}
              xLabel="频率 / Hz（对数轴）"
              yLabel="幅值 / dB"
              xFormat={(v) => num(10 ** v, 4)}
            />
            <Reference title="二阶系统分析" text={ct} />
          </>
        )}
        <Note>
          标准二阶、无零点模型。ζ=0 不收敛；ζ≥1 无超调。Bode 图显示限于 −100～80
          dB，无阻尼谐振点按图上限显示。
        </Note>
      </Section>
      <Section
        title="Buck / Boost · 电感与输出电容"
        preset={() => {
          setMode("buck");
          setDc({
            vin: 24,
            vout: 12,
            current: 2,
            frequency: 100000,
            rippleFraction: 0.3,
            voltageRipple: 0.05,
          });
        }}
      >
        <Select
          label="变换器"
          value={mode}
          set={(v) => {
            setMode(v);
            setDc({
              ...dc,
              vin: v === "buck" ? 24 : 12,
              vout: v === "buck" ? 12 : 24,
            });
          }}
          options={[
            ["buck", "Buck 降压"],
            ["boost", "Boost 升压"],
          ]}
        />
        <NumberFields
          value={dc}
          set={setDc}
          fields={[
            ["vin", "输入电压 / V"],
            ["vout", "输出电压 / V"],
            ["current", "输出电流 / A"],
            ["frequency", "开关频率 / Hz"],
            ["rippleFraction", "电感纹波峰峰值 / 平均值"],
            ["voltageRipple", "输出电压纹波峰峰值 / V"],
          ]}
        />
        <Result text={dt} error={d.error} />
        {d.value && (
          <Reference
            title="DC–DC 元件估算"
            text={
              dt +
              "\n假设理想 CCM，未含 ESR、损耗、瞬态与控制环要求；选型需核查饱和电流、温升与器件手册。"
            }
          />
        )}
        <Note>
          Lmin 是 CCM 临界值，实际 L 需高于它并满足纹波目标。Cout
          为理想纹波下限，未包括 ESR、偏压降容及负载瞬态。
        </Note>
      </Section>
      <Section title="三相功率因数 · 并联补偿电容">
        <NumberFields
          value={pf}
          set={setPf}
          fields={[
            ["powerW", "有功功率 / W"],
            ["lineVoltage", "线电压 / V RMS"],
            ["frequency", "电网频率 / Hz"],
            ["initial", "原滞后功率因数"],
            ["target", "目标功率因数"],
          ]}
        />
        <Select
          label="电容连接"
          value={connection}
          set={setConnection}
          options={[
            ["delta", "三角形 Δ"],
            ["star", "星形 Y"],
          ]}
        />
        <Result text={pt} error={p.error} />
        {p.value && <Reference title="三相无功补偿" text={pt} />}
        <Note>
          每相电容值，理想平衡正弦系统；实际设计需校核谐波、投切暂态、电压等级及保护。
        </Note>
      </Section>
    </div>
  );
}
