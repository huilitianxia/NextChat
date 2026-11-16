"use client";
import dynamic from "next/dynamic";
import { useCampusUI } from "../store/campus";
import type { ArtifactKind } from "../utils/campus-types";
import styles from "./campus.module.scss";
const ChemViewer = dynamic(() => import("./chem-viewer"), { ssr: false });
const AnkiExporter = dynamic(() => import("./anki-exporter"), { ssr: false });
const MindmapViewer = dynamic(() => import("./mindmap-viewer"), { ssr: false });
const PyodideRunner = dynamic(() => import("./pyodide-runner"), { ssr: false });
const QuizCard = dynamic(() => import("./quiz-card"), { ssr: false });
export default function CodeTools({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const open = useCampusUI((state) => state.openArtifact),
    name = language.toLowerCase();
  const artifact = ["html", "svg", "mermaid", "echarts"].includes(name);
  return (
    <>
      {artifact && (
        <div className={styles.exportBar}>
          <button
            onClick={() =>
              open({ kind: name as ArtifactKind, code, title: `${name} 预览` })
            }
          >
            预览 / Preview
          </button>
        </div>
      )}
      {name === "smiles" && <ChemViewer code={code} />}
      {name === "anki" && <AnkiExporter code={code} />}
      {name === "quiz" && <QuizCard key={code} code={code} />}
      {["mindmap", "markmap"].includes(name) && <MindmapViewer code={code} />}
      {["python", "py"].includes(name) &&
        /\b(matplotlib|numpy|scipy)\b/.test(code) && (
          <PyodideRunner code={code} />
        )}
    </>
  );
}
