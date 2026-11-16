import { getHeaders } from "../client/api";
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const AUDIO_ACCEPT = ".m4a,.mp3,.wav,.webm";
export const isAudioFile = (file: File) =>
  /\.(m4a|mp3|wav|webm)$/i.test(file.name);
export function pcmWav(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer);
  const word = (offset: number, text: string) =>
    [...text].forEach((char, i) =>
      view.setUint8(offset + i, char.charCodeAt(0)),
    );
  word(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
export async function transcribeAudio(
  file: File,
  signal: AbortSignal,
  progress: (text: string) => void,
) {
  if (!isAudioFile(file) || !file.size || file.size > MAX_AUDIO_BYTES)
    throw new Error("请选择不超过 25MB 的 m4a、mp3、wav 或 webm 音频。");
  const headers = new Headers(getHeaders());
  headers.delete("Content-Type");
  async function transcribe(blob: Blob, name: string) {
    signal.throwIfAborted();
    const form = new FormData();
    form.set("file", blob, name);
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers,
      body: form,
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "转写失败");
    return String(result.text || "");
  }
  if (file.size <= 3500000) {
    progress("正在转写音频…");
    return transcribe(file, file.name);
  }
  progress("正在本地解码与分段…");
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    signal.throwIfAborted();
    const segmentLength = Math.floor(buffer.sampleRate * 100),
      count = Math.ceil(buffer.length / segmentLength),
      texts: string[] = [];
    for (let part = 0; part < count; part++) {
      signal.throwIfAborted();
      progress(`正在转写第 ${part + 1} / ${count} 段…`);
      const start = part * segmentLength,
        end = Math.min(buffer.length, start + segmentLength);
      const samples = new Float32Array(end - start);
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < samples.length; i++)
          samples[i] += data[start + i] / buffer.numberOfChannels;
      }
      texts.push(
        await transcribe(
          pcmWav(samples, buffer.sampleRate),
          `part-${part + 1}.wav`,
        ),
      );
    }
    return texts.join("\n\n");
  } catch (e) {
    if ((e as Error).name === "EncodingError")
      throw new Error("浏览器无法解码此音频，请转换为 MP3 或 WAV 后重试。");
    throw e;
  } finally {
    await context.close();
  }
}
