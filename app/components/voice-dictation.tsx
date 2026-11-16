"use client";
import { useEffect, useRef, useState } from "react";
import { currentIdentity } from "../utils/identity-storage";
import { transcribeAudio } from "../utils/audio-transcription";
import styles from "./finale.module.scss";
export default function VoiceDictation({
  onInsert,
}: {
  onInsert: (text: string) => void;
}) {
  const [mode, setMode] = useState<
      "idle" | "speech" | "recording" | "transcribing"
    >("idle"),
    [status, setStatus] = useState(""),
    [fallback, setFallback] = useState(false);
  const resources = useRef<{
      recognition?: any;
      recorder?: MediaRecorder;
      stream?: MediaStream;
      abort?: AbortController;
      timer?: ReturnType<typeof setTimeout>;
    }>({}),
    alive = useRef(true),
    insert = useRef(onInsert);
  insert.current = onInsert;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      resources.current.recognition?.abort();
      resources.current.abort?.abort();
      if (resources.current.recorder?.state === "recording")
        resources.current.recorder.stop();
      resources.current.stream?.getTracks().forEach((track) => track.stop());
      clearTimeout(resources.current.timer);
    };
  }, []);
  async function record() {
    const owner = currentIdentity();
    setStatus("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setStatus("此浏览器无法录音，请使用已有的音频上传转写入口。");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current || owner !== currentIdentity()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      if (!mime) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("录音格式不受支持，请上传音频文件。");
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime }),
        chunks: Blob[] = [];
      resources.current = { stream, recorder };
      let bytes = 0;
      recorder.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > 20 * 1024 * 1024 && recorder.state === "recording")
            recorder.stop();
        }
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (alive.current) {
          setMode("idle");
          setStatus("录音失败，请检查麦克风权限。");
        }
      };
      recorder.onstop = async () => {
        clearTimeout(resources.current.timer);
        stream.getTracks().forEach((t) => t.stop());
        if (!alive.current || owner !== currentIdentity()) return;
        const file = new File(
            chunks,
            `dictation.${mime.includes("mp4") ? "m4a" : "webm"}`,
            { type: mime },
          ),
          abort = new AbortController();
        resources.current.abort = abort;
        if (!file.size) {
          setMode("idle");
          setStatus("未录到音频。");
          return;
        }
        setMode("transcribing");
        setStatus("正在通过现有语音转写服务识别…");
        try {
          const text = await transcribeAudio(
            file,
            abort.signal,
            (message) => alive.current && setStatus(message),
          );
          if (alive.current && owner === currentIdentity()) {
            insert.current(text);
            setStatus("听写已插入输入框。");
          }
        } catch (e) {
          if (alive.current) setStatus((e as Error).message);
        } finally {
          if (alive.current) setMode("idle");
        }
      };
      recorder.start(1000);
      setMode("recording");
      setStatus("正在录音，点击停止后转写（最长 60 秒）。");
      resources.current.timer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 60000);
    } catch (e) {
      if (alive.current) {
        setMode("idle");
        setStatus((e as Error).message || "麦克风无法启动。");
      }
    }
  }
  function start() {
    if (mode === "speech") {
      resources.current.recognition?.stop();
      return;
    }
    if (mode === "recording") {
      resources.current.recorder?.stop();
      return;
    }
    if (mode === "transcribing") {
      resources.current.abort?.abort();
      return;
    }
    const Recognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Recognition || fallback) {
      setFallback(true);
      void record();
      return;
    }
    const owner = currentIdentity(),
      recognition = new Recognition();
    resources.current.recognition = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event: any) => {
      if (!alive.current || owner !== currentIdentity()) return;
      let final = "",
        draft = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else draft += event.results[i][0].transcript;
      }
      if (final) insert.current(final);
      setStatus(draft || "正在听写…");
    };
    recognition.onerror = (event: any) => {
      if (!alive.current) return;
      setMode("idle");
      setFallback(true);
      setStatus(
        event.error === "not-allowed"
          ? "麦克风权限被拒绝。允许权限后可点击录音转写。"
          : "浏览器听写不可用，可改用录音转写。",
      );
    };
    recognition.onend = () => {
      if (alive.current) setMode("idle");
    };
    try {
      recognition.start();
      setMode("speech");
      setStatus("正在听写，点击停止；结果仅插入草稿。");
    } catch {
      setFallback(true);
      void record();
    }
  }
  return (
    <>
      <button
        type="button"
        aria-label={mode === "idle" ? "语音听写" : "停止听写"}
        aria-pressed={mode !== "idle"}
        onClick={start}
      >
        {mode === "recording"
          ? "■ 停止录音"
          : mode === "transcribing"
          ? "取消转写"
          : mode === "speech"
          ? "■ 停止听写"
          : fallback
          ? "● 录音转写"
          : "◉ 语音听写"}
      </button>
      {status && (
        <span role="status" className={styles.muted}>
          {status}
        </span>
      )}
    </>
  );
}
