"use client";
import { useState } from "react";
import {
  PK_EXAMPLE,
  pharmacokinetics,
  creatinineClearance,
  acidBase,
} from "../utils/junior-medical";
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
export default function JuniorMedical() {
  const [pk, setPk] = useState(PK_EXAMPLE),
    [renal, setRenal] = useState({ age: 65, weight: 70, scr: 1.4 }),
    [female, setFemale] = useState(false),
    [unit, setUnit] = useState<"mg/dL" | "µmol/L">("mg/dL"),
    [ab, setAb] = useState({
      na: 140,
      cl: 104,
      hco3: 16,
      pco2: 32,
      albumin: 3,
      potassium: 0,
    }),
    [confirmed, setConfirmed] = useState(true);
  const p = calculate(() => pharmacokinetics(pk)),
    r = calculate(() =>
      creatinineClearance(renal.age, renal.weight, renal.scr, female, unit),
    ),
    a = calculate(() =>
      acidBase(
        ab.na,
        ab.cl,
        ab.hco3,
        ab.pco2,
        ab.albumin,
        ab.potassium,
        confirmed,
      ),
    );
  const pkText = p.value
    ? `模型：一室、瞬时吸收 / 静脉推注近似；Vd=${pk.vd} L，CL=${
        pk.clearance
      } L/h，F=${pk.availability}，τ=${pk.interval} h，目标平均浓度=${
        pk.target
      } mg/L，每次剂量=${pk.dose} mg。\nDL = Cp·Vd/F = ${num(
        p.value.loadingDose,
      )} mg；MD = Cp·CL·τ/F = ${num(
        p.value.maintenanceDose,
      )} mg/次。\nke = CL/Vd = ${num(p.value.ke)} h⁻¹；t½=${num(
        p.value.halfLife,
      )} h。\n按所填剂量：Css平均=${num(p.value.cssAverage)}，峰=${num(
        p.value.cssPeak,
      )}，谷=${num(p.value.cssTrough)} mg/L。首剂${
        pk.loading ? "使用 DL" : "使用常规剂量"
      }，显示 ${pk.intervals} 个间隔。`
    : "";
  const renalText = r.value
    ? `Cockcroft–Gault：年龄 ${renal.age} 岁，选用体重 ${
        renal.weight
      } kg，Scr=${renal.scr} ${unit}，${
        female ? "女性系数 0.85" : "男性系数 1"
      }。\nCrCl = (140−年龄)·体重/(72·Scr[mg/dL])·系数 = ${num(
        r.value.crcl,
      )} mL/min。\n给药核查：按具体药品说明书确认使用 CrCl 还是 eGFR 及阈值，结合稳定肌酐、体重选择和必要的血药浓度监测；本结果不直接生成剂量。`
    : "";
  const acidText = a.value
    ? `Na=${ab.na}，Cl=${ab.cl}，HCO₃=${ab.hco3}，K附加项=${
        ab.potassium
      } mmol/L；白蛋白=${ab.albumin} g/dL，PaCO₂=${
        ab.pco2
      } mmHg。\nAG = Na + K − Cl − HCO₃ = ${num(
        a.value.ag,
      )} mmol/L；白蛋白校正 AG = ${num(
        a.value.correctedAG,
      )} mmol/L。\nWinter 预期 PaCO₂ = 1.5·HCO₃+8±2 = ${num(a.value.low)}–${num(
        a.value.high,
      )} mmHg。${a.value.interpretation}。`
    : "";
  return (
    <div className={styles.tools}>
      <Note>
        临床药理与内科学教学例题。输入不关联真实患者；计算基于明确假设，不能单凭结果作处方或诊断。
      </Note>
      <Section
        title="药代动力学 · 多次给药浓度曲线"
        preset={() => setPk(PK_EXAMPLE)}
      >
        <NumberFields
          value={{
            target: pk.target,
            vd: pk.vd,
            clearance: pk.clearance,
            availability: pk.availability,
            interval: pk.interval,
            dose: pk.dose,
            intervals: pk.intervals,
          }}
          set={(v) => setPk({ ...pk, ...v })}
          fields={[
            ["target", "目标 Cp / mg·L⁻¹"],
            ["vd", "分布容积 Vd / L"],
            ["clearance", "清除率 CL / L·h⁻¹"],
            ["availability", "生物利用度 F / 0–1"],
            ["interval", "给药间隔 τ / h"],
            ["dose", "常规剂量 / mg"],
            ["intervals", "显示间隔数 / 1–24"],
          ]}
        />
        <label>
          <input
            type="checkbox"
            checked={pk.loading}
            onChange={(e) => setPk({ ...pk, loading: e.target.checked })}
          />
          首剂使用计算的负荷剂量
        </label>
        <Result text={pkText} error={p.error} />
        {p.value && (
          <>
            <Plot
              title="血药浓度–时间"
              points={p.value.points}
              xLabel="时间 / h"
              yLabel="浓度 / mg·L⁻¹"
            />
            <Reference
              title="药代动力学"
              text={
                pkText +
                "\n教学模型：线性消除，忽略吸收过程、分布多室与个体差异。"
              }
            />
          </>
        )}
        <Note>
          目标 Cp 用于平均浓度给药估算；DL
          建立初始浓度。口服药仅采用瞬时吸收近似，不能据此预测真实口服峰时。
        </Note>
      </Section>
      <Section
        title="肾功能 · Cockcroft–Gault CrCl"
        preset={() => {
          setRenal({ age: 65, weight: 70, scr: 1.4 });
          setUnit("mg/dL");
          setFemale(false);
        }}
      >
        <NumberFields
          value={renal}
          set={setRenal}
          fields={[
            ["age", "年龄 / 岁（成人）"],
            ["weight", "选用体重 / kg"],
            ["scr", `血清肌酐 / ${unit}`],
          ]}
        />
        <div className={styles.grid}>
          <Select
            label="肌酐单位"
            value={unit}
            set={(next) => {
              setRenal({
                ...renal,
                scr:
                  next === unit
                    ? renal.scr
                    : next === "µmol/L"
                    ? renal.scr * 88.4
                    : renal.scr / 88.4,
              });
              setUnit(next);
            }}
            options={[
              ["mg/dL", "mg/dL"],
              ["µmol/L", "µmol/L"],
            ]}
          />
          <Select
            label="公式性别系数"
            value={female ? "female" : "male"}
            set={(v) => setFemale(v === "female")}
            options={[
              ["male", "男性 · 1"],
              ["female", "女性 · 0.85"],
            ]}
          />
        </div>
        <Result text={renalText} error={r.error} />
        {r.value && <Reference title="CrCl" text={renalText} />}
        <Note>
          CrCl 不是 CKD 分期的
          eGFR。急性肾损伤、肌酐未稳态、极端体型等情形需另行评估；体重取实际、理想或校正值应依适用方案确认。
        </Note>
      </Section>
      <Section
        title="酸碱平衡 · 阴离子间隙与 Winter 公式"
        preset={() =>
          setAb({
            na: 140,
            cl: 104,
            hco3: 16,
            pco2: 32,
            albumin: 3,
            potassium: 0,
          })
        }
      >
        <NumberFields
          value={ab}
          set={setAb}
          fields={[
            ["na", "Na⁺ / mmol·L⁻¹"],
            ["cl", "Cl⁻ / mmol·L⁻¹"],
            ["hco3", "HCO₃⁻ / mmol·L⁻¹"],
            ["pco2", "PaCO₂ / mmHg"],
            ["albumin", "白蛋白 / g·dL⁻¹"],
            ["potassium", "AG 的 K⁺ 附加项 / mmol·L⁻¹（0 表示不含钾）"],
          ]}
        />
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          本例已确认存在代谢性酸中毒
        </label>
        <Result text={acidText} error={a.error} />
        {a.value && <Reference title="酸碱平衡" text={acidText} />}
        <Note>
          AG 是否异常须对照本实验室及是否含钾的参考范围；Winter
          仅用于已确定代谢性酸中毒的代偿判断，需结合 pH、病史与临床情况。
        </Note>
      </Section>
    </div>
  );
}
