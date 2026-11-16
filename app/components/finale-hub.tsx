"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useFinale } from "../store/finale";
import { useCapstone } from "../store/capstone";
import styles from "./finale.module.scss";
const CitationFormatter = dynamic(() => import("./citation-formatter"), {
  ssr: false,
});
const EquationScratchpad = dynamic(() => import("./equation-scratchpad"), {
  ssr: false,
});
const DisciplineToolbox = dynamic(() => import("./discipline-toolbox"), {
  ssr: false,
});
const PromptMacros = dynamic(() => import("./prompt-macros"), { ssr: false });
const KnowledgeVault = dynamic(() => import("./knowledge-vault"), {
  ssr: false,
});
const CurveFitter = dynamic(() => import("./curve-fitter"), { ssr: false });
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
