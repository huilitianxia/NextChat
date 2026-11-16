"use client";
import { useEffect, useRef, useState } from "react";
import { CampusDialog } from "./campus-dialog";
import { getHeaders } from "../client/api";
import { assertSafePrompt } from "../utils/security-guard";
import type { ImageRevision } from "../utils/campus-types";
import styles from "./campus.module.scss";
const blobFrom = (
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("图片编码失败"))),
      type,
      quality,
    ),
  );
export default function ImageAnnotator({
  src,
  onClose,
  onComplete,
}: {
  src: string;
  onClose: () => void;
  onComplete: (revision: ImageRevision) => void;
}) {
  const base = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false),
    points = useRef<{ x: number; y: number } | null>(null),
    history = useRef<ImageData[]>([]),
    abort = useRef<AbortController>();
  const [brush, setBrush] = useState(35),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [painted, setPainted] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let frame = 0;
    setReady(false);
    const image = new Image();
    image.onload = () => {
      if (!active || !base.current || !overlay.current) return;
      const ratio = Math.min(1, 1536 / Math.max(image.width, image.height));
      for (const canvas of [base.current, overlay.current]) {
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
      }
      base.current
        .getContext("2d")!
        .drawImage(image, 0, 0, base.current.width, base.current.height);
      setReady(true);
    };
    image.onerror = () => setError("无法读取原图，请重新上传。");
    const loadWhenMounted = () => {
      if (!active) return;
      // The dialog mounts its portal after the first render; data URLs can decode before it.
      if (!base.current || !overlay.current) {
        frame = requestAnimationFrame(loadWhenMounted);
        return;
      }
      image.src = src;
    };
    loadWhenMounted();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      abort.current?.abort();
    };
  }, [src]);
  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || busy) return;
    const canvas = overlay.current!,
      rect = canvas.getBoundingClientRect(),
      x = ((event.clientX - rect.left) * canvas.width) / rect.width,
      y = ((event.clientY - rect.top) * canvas.height) / rect.height,
      ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "rgba(31,171,147,.65)";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = brush;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (points.current) {
      ctx.moveTo(points.current.x, points.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.arc(x, y, brush / 2, 0, 2 * Math.PI);
      ctx.fill();
    }
    points.current = { x, y };
    setPainted(true);
  }
  async function submit() {
    if (!ready || busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      assertSafePrompt(prompt);
      if (!prompt.trim()) throw new Error("请先填写修改要求。");
      const original = base.current!,
        mark = overlay.current!;
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = original.width;
      maskCanvas.height = original.height;
      const ctx = maskCanvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      if (painted) {
        const data = ctx.getImageData(
            0,
            0,
            maskCanvas.width,
            maskCanvas.height,
          ),
          paint = mark
            .getContext("2d")!
            .getImageData(0, 0, mark.width, mark.height);
        for (let i = 3; i < data.data.length; i += 4)
          if (paint.data[i] > 0) data.data[i] = 0;
        ctx.putImageData(data, 0, 0);
      }
      let file = await blobFrom(original),
        mask = painted ? await blobFrom(maskCanvas) : null;
      if (file.size + (mask?.size || 0) > 3900000)
        file = await blobFrom(original, "image/jpeg", 0.9);
      if (file.size + (mask?.size || 0) > 3900000)
        throw new Error("压缩后图片仍过大，请上传较小图片。");
      const form = new FormData();
      form.set(
        "image",
        file,
        file.type === "image/png" ? "original.png" : "original.jpg",
      );
      if (mask) form.set("mask", mask, "mask.png");
      form.set("prompt", prompt);
      const headers = new Headers(getHeaders());
      headers.delete("Content-Type");
      const response = await fetch("/api/image-edit", {
        method: "POST",
        headers,
        body: form,
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error((await response.json()).error || "图像修改失败");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("没有收到图像结果");
      const decoder = new TextDecoder();
      let buffer = "",
        result: ImageRevision | null = null;
      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          let split: number;
          while ((split = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, split);
            buffer = buffer.slice(split + 1);
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "error") throw new Error(event.error);
            if (
              event.type === "result" &&
              typeof event.image === "string" &&
              event.image.startsWith("data:image/")
            )
              result = {
                before: src,
                after: event.image,
                model: event.model,
                prompt,
              };
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!result) throw new Error("图像服务没有返回完成结果，请重试。");
      const decoded = new Image();
      decoded.src = result.after;
      try {
        await decoded.decode();
      } catch {
        throw new Error("图像服务返回的图片无法读取，请重试。");
      }
      controller.signal.throwIfAborted();
      onComplete(result);
      onClose();
    } catch (e) {
      setError(
        controller.signal.aborted ? "图片修改已停止。" : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <CampusDialog title="图片精修模式 · Image-2.6" onClose={onClose}>
      <p className={styles.muted}>
        涂抹需要修改的区域；留空则调整整张图。原图会保留在对话中。
      </p>
      <label className={styles.field}>
        画笔大小：{brush}
        <input
          type="range"
          min="6"
          max="160"
          value={brush}
          disabled={busy}
          onChange={(e) => setBrush(Number(e.target.value))}
        />
      </label>
      <div className={styles.toolbar}>
        <button
          disabled={busy}
          onClick={() => {
            const prior = history.current.pop();
            if (prior) {
              overlay.current!.getContext("2d")!.putImageData(prior, 0, 0);
              setPainted(prior.data.some((v, i) => i % 4 === 3 && v > 0));
            }
          }}
        >
          撤销
        </button>
        <button
          disabled={busy}
          onClick={() => {
            const c = overlay.current!;
            history.current.push(
              c.getContext("2d")!.getImageData(0, 0, c.width, c.height),
            );
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setPainted(false);
          }}
        >
          重置
        </button>
      </div>
      <div
        className={styles.canvas}
        style={{ width: base.current?.width || "100%" }}
      >
        <canvas ref={base} />
        <canvas
          ref={overlay}
          aria-label="图片修改区域画布"
          onPointerDown={(e) => {
            if (!ready || busy) return;
            const c = overlay.current!;
            history.current.push(
              c.getContext("2d")!.getImageData(0, 0, c.width, c.height),
            );
            if (history.current.length > 8) history.current.shift();
            drawing.current = true;
            points.current = null;
            e.currentTarget.setPointerCapture(e.pointerId);
            draw(e);
          }}
          onPointerMove={draw}
          onPointerUp={() => {
            drawing.current = false;
            points.current = null;
          }}
          onPointerCancel={() => {
            drawing.current = false;
            points.current = null;
          }}
        />
      </div>
      <div className={styles.toolbar}>
        {["改黄昏暮光", "替换中式立面", "丰富植被配景"].map((text) => (
          <button
            disabled={busy}
            key={text}
            onClick={() =>
              setPrompt(`${text}，保留原有构图、建筑体量与未涂抹区域。`)
            }
          >
            {text}
          </button>
        ))}
      </div>
      <label className={styles.field}>
        修改要求
        <textarea
          value={prompt}
          maxLength={8000}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <div className={styles.toolbar}>
        <button disabled={busy || !ready || !prompt.trim()} onClick={submit}>
          图像微调 (Image-2.6)
        </button>
        {busy && <button onClick={() => abort.current?.abort()}>停止</button>}
      </div>
      {busy && <p role="status">正在生成修改图，请稍候…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </CampusDialog>
  );
}
