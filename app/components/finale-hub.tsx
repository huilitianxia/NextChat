"use client";
import { lazyModal } from "./lazy-modal";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useFinale } from "../store/finale";
import { useCapstone } from "../store/capstone";
import styles from "./finale.module.scss";
const CitationFormatter = lazyModal(
  () => import("./citation-formatter"),
  "参考文献格式化器",
);
const EquationScratchpad = lazyModal(
  () => import("./equation-scratchpad"),
  "公式草稿本",
);
const DisciplineToolbox = lazyModal(
  () => import("./discipline-toolbox"),
  "专业百宝箱",
);
const PromptMacros = lazyModal(
  () => import("./prompt-macros"),
  "个人快捷指令库",
);
const KnowledgeVault = lazyModal(() => import("./knowledge-vault"), "知识手账");
const CurveFitter = lazyModal(() => import("./curve-fitter"), "实验数据拟合台");
const SpeechPlayer = dynamic(() => import("./speech-player"), { ssr: false });
export default function FinaleHub() {
  const { tool, zen, open, toggleZen } = useFinale();
  const file = useCapstone((s) => s.file);
  useEffect(() => {
    document.documentElement.dataset.zen = String(zen);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && zen && !tool) toggleZen();
    };
    document.addEventListener("keydown", key);
    return () => {
      delete document.documentElement.dataset.zen;
      document.removeEventListener("keydown", key);
    };
  }, [zen, tool, toggleZen]);
  const close = () => open(null);
  return (
    <>
      {tool === "vault" && <KnowledgeVault onClose={close} />}
      {file && (
        <CurveFitter
          file={file}
          onClose={() => useCapstone.setState({ file: null })}
        />
      )}
      <SpeechPlayer />
      {tool === "citations" && <CitationFormatter onClose={close} />}{" "}
      {tool === "equations" && <EquationScratchpad onClose={close} />}{" "}
      {tool === "toolbox" && <DisciplineToolbox onClose={close} />}{" "}
      {tool === "macros" && <PromptMacros onClose={close} />}{" "}
      {zen && (
        <button className={styles.exitZen} onClick={toggleZen}>
          退出专注阅读 · Esc
        </button>
      )}
    </>
  );
}
