import { getLines, getMessages } from "@fortaine/fetch-event-source/parse";

export const PYTHON_CHAT_PATH = "/api/python-chat";
export const CONTAINER_FILE_PATH = "/api/container-file";

export type PythonStreamEvent =
  | { type: "delta"; text: string }
  | { type: "image"; text: string; url: string }
  | { type: "done" }
  | { type: "error"; message: string };

export const SIMULATION_IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
  gif: "image/gif",
} as const;

export type SimulationImageFormat = keyof typeof SIMULATION_IMAGE_TYPES;

export function simulationImageFormat(value: string) {
  const extension = value.toLowerCase();
  const format = extension === "jpeg" ? "jpg" : extension;
  return Object.prototype.hasOwnProperty.call(SIMULATION_IMAGE_TYPES, format)
    ? (format as SimulationImageFormat)
    : undefined;
}

export function isSimulationImageUrl(url: string) {
  return url.startsWith(CONTAINER_FILE_PATH + "?");
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function* readPythonEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const pending: string[] = [];
  const takeChunk = getLines(
    getMessages(({ data }) => {
      if (data) pending.push(data);
    }),
  );
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      takeChunk(value);
      for (const data of pending) {
        if (data === "[DONE]") return;
        const event = record(JSON.parse(data));
        if (event) yield event;
      }
      pending.length = 0;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
