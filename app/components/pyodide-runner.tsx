"use client";
import { useEffect, useRef, useState } from "react";
import { pythonDocument } from "../utils/pyodide-document";
import { saveFile } from "../utils/doc-io";
import styles from "./campus.module.scss";
export default function PyodideRunner({ code }: { code: string }) {
  const frame = useRef<HTMLIFrameElement>(null),
    token = useRef("");
  const [source, setSource] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [output, setOutput] = useState(""),
    [images, setImages] = useState<string[]>([]);
  useEffect(() => {
    if (!source) return;
    const timer = setTimeout(() => {
      setError("运行已超过 3 分钟，已停止。可缩小数据规模后重试。");
      setSource("");
    }, 180000);
    const message = (e: MessageEvent) => {
      if (
        e.source !== frame.current?.contentWindow ||
        e.data?.token !== token.current
      )
        return;
      if (e.data.type === "status") setStatus(String(e.data.text));
      if (e.data.type === "error") {
        setError(String(e.data.error));
        setSource("");
      }
      if (e.data.type === "result") {
        setOutput(String(e.data.output || "").slice(0, 16000));
        setImages(
          (Array.isArray(e.data.images) ? e.data.images : [])
            .filter(
              (value: unknown) =>
                typeof value === "string" &&
                value.length < 25000000 &&
                /^[A-Za-z0-9+/=]+$/.test(value),
            )
            .slice(0, 6),
        );
        setStatus("本地运行完成 · PNG 300 DPI");
        setSource("");
      }
    };
    window.addEventListener("message", message);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", message);
    };
  }, [source]);
  return (
    <div className={styles.codeTool}>
      <div className={styles.toolbar}>
        <button
          disabled={!!source}
          onClick={() => {
            token.current = crypto.randomUUID();
            setError("");
            setImages([]);
            setOutput("");
            setStatus("首次加载可能需要一段时间…");
            setSource(pythonDocument(code, token.current));
          }}
        >
          本地运行绘图 (Pyodide)
        </button>
        {source && (
          <button
            onClick={() => {
              setSource("");
              setStatus("已停止运行");
            }}
          >
            停止运行
          </button>
        )}
      </div>
      <p className={styles.muted}>
        点击后在隔离的浏览器环境执行代码；首次使用需要下载 Python 和科学计算库。
      </p>
      {source && (
        <iframe
          ref={frame}
          title="本地 Python 隔离环境"
          sandbox="allow-scripts"
          srcDoc={source}
          style={{ display: "none" }}
        />
      )}
      {status && (
        <p role="status" className={styles.notice}>
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {output && <pre>{output}</pre>}
      {images.map((image, index) => (
        <div key={index}>
          <img
            alt={`Python 绘图 ${index + 1}`}
            src={`data:image/png;base64,${image}`}
          />
          <div className={styles.toolbar}>
            <button
              onClick={async () =>
                saveFile(
                  await (await fetch(`data:image/png;base64,${image}`)).blob(),
                  `plot-${index + 1}-300dpi.png`,
                )
              }
            >
              下载 300 DPI PNG
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
