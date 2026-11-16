"use client";
import { useEffect, useState } from "react";
import { saveFile } from "../utils/doc-io";
import { svgPng } from "../utils/client-runtime";
import styles from "./campus.module.scss";
export default function ChemViewer({ code }: { code: string }) {
  const [result, setResult] = useState<{
      svg: string;
      formula: string;
      weight: number;
    }>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setResult(undefined);
    setError("");
    (async () => {
      try {
        const { Molecule } = await import("openchemlib");
        const smiles = code
          .trim()
          .replace(/^<smiles>|<\/smiles>$/gi, "")
          .trim();
        if (!smiles || smiles.length > 5000)
          throw new Error("SMILES 为空或过长");
        const molecule = Molecule.fromSmiles(smiles);
        if (molecule.getAllAtoms() > 300)
          throw new Error("结构过大，请拆分查看。");
        const formula = molecule.getMolecularFormula();
        const svg = molecule.toSVG(720, 360, "molecule");
        if (active)
          setResult({
            svg,
            formula: formula.formula,
            weight: formula.relativeWeight,
          });
      } catch (e) {
        if (active) setError(`无法解析分子结构：${(e as Error).message}`);
      }
    })();
    return () => {
      active = false;
    };
  }, [code]);
  return (
    <div className={styles.codeTool}>
      {result ? (
        <>
          <img
            alt={`分子骨架：${result.formula}`}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
              result.svg,
            )}`}
            style={{ background: "white", width: "100%" }}
          />
          <p>
            分子式：<strong>{result.formula}</strong>　摩尔质量：
            <strong>{result.weight.toFixed(4)} g/mol</strong>
          </p>
          <div className={styles.toolbar}>
            <button
              onClick={async () => {
                try {
                  await saveFile(
                    new Blob([result.svg], { type: "image/svg+xml" }),
                    "molecule.svg",
                  );
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              下载 SVG
            </button>
            <button
              onClick={async () => {
                try {
                  await saveFile(await svgPng(result.svg), "molecule.png");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              下载 PNG
            </button>
          </div>
        </>
      ) : (
        !error && <p role="status">正在绘制分子结构…</p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
