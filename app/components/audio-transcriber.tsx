"use client";
import { useEffect, useRef, useState } from "react";
import { CampusDialog } from "./campus-dialog";
import {
  AUDIO_ACCEPT,
  AUDIO_REQUEST_LIMIT,
  AUDIO_SPLIT_NOTICE,
  MAX_AUDIO_BYTES,
  transcribeAudio,
} from "../utils/audio-transcription";
import styles from "./campus.module.scss";
export default function AudioTranscriber({
  file,
  onClose,
  onInsert,
}: {
  file?: File;
  onClose: () => void;
  onInsert: (text: string) => void;
}) {
  const [selected, setSelected] = useState(file),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  async function run() {
    if (!selected || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      setText(await transcribeAudio(selected, abort.signal, setStatus));
      setStatus("转写完成，可以编辑后放入输入框。");
    } catch (e) {
      setError(abort.signal.aborted ? "转写已停止。" : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <CampusDialog title="音频转文字" onClose={onClose}>
      <p className={styles.muted}>
        支持最多 25MB 的录音。点击开始后，音频将发送给管理员配置的转写服务。
      </p>
      <label className={styles.field}>
        选择录音
        <input
          type="file"
          accept={AUDIO_ACCEPT}
          disabled={busy}
          onChange={(e) => {
            setSelected(e.target.files?.[0]);
            setText("");
            setError("");
            setStatus("");
          }}
        />
      </label>
      {selected && (
        <p>
          {selected.name} · {(selected.size / 1048576).toFixed(1)} MB
        </p>
      )}
      {selected && selected.size > AUDIO_REQUEST_LIMIT && (
        <p role="status" className={styles.notice}>
          {selected.size > MAX_AUDIO_BYTES
            ? "文件超过 25 MB 的本地处理上限，请压缩或分段后上传。"
            : AUDIO_SPLIT_NOTICE}
        </p>
      )}
      <div className={styles.toolbar}>
        <button
          disabled={!selected || busy || selected.size > MAX_AUDIO_BYTES}
          onClick={run}
        >
          开始转写
        </button>
        {busy && (
          <button onClick={() => controller.current?.abort()}>停止</button>
        )}
      </div>
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
      {text && (
        <>
          <label className={styles.field}>
            转写文字
            <textarea value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className={styles.toolbar}>
            <button
              onClick={() => {
                onInsert(
                  `请整理以下课堂/会议录音，提炼重点、结论与待办：\n\n${text}`,
                );
                onClose();
              }}
            >
              放入输入框
            </button>
          </div>
        </>
      )}
    </CampusDialog>
  );
}
