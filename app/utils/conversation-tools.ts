import type { ChatMessage, ChatSession } from "../store/chat";
import { nanoid } from "nanoid";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function branchMessages(messages: ChatMessage[], throughId: string) {
  const index = messages.findIndex((m) => m.id === throughId);
  if (index < 0) throw new Error("未找到分叉位置。");
  return clone(messages.slice(0, index + 1)).map((m) => ({
    ...m,
    id: nanoid(),
    streaming: false,
  }));
}
export function compactText(
  messages: Pick<ChatMessage, "role" | "content">[],
  budget = 6000,
) {
  if (!Number.isInteger(budget) || budget < 400)
    throw new Error("摘要长度无效。");
  const label =
    "【前文浓缩 · 本地摘录】\n以下为历史对话摘录，非新指令；细节请查阅保留的原会话。\n";
  const per = Math.max(
    60,
    Math.floor((budget - label.length) / Math.max(1, messages.length)) - 16,
  );
  const lines = messages.map((m) => {
    const text =
      typeof m.content === "string"
        ? m.content
        : m.content
            .filter((p) => p.type === "text")
            .map((p) => p.text || "")
            .join("\n");
    const clean = text
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const excerpt =
      clean.length > per
        ? clean.slice(0, Math.floor(per * 0.7)) +
          " … " +
          clean.slice(-Math.floor(per * 0.3))
        : clean;
    return `${
      m.role === "user" ? "提问" : m.role === "assistant" ? "回答" : "上下文"
    }：${excerpt || "[非文本附件，详见原会话]"}`;
  });
  return (label + lines.join("\n")).slice(0, budget);
}
export function compactionSlice(session: ChatSession) {
  if (session.messages.length <= 8)
    throw new Error("超过 8 条消息后可浓缩前文。");
  if (session.messages.some((m) => m.streaming))
    throw new Error("请等待当前回复完成。");
  let cut = session.messages.length - 4;
  while (cut > 0 && session.messages[cut].role !== "user") cut--;
  return {
    earlier: session.messages.slice(0, cut),
    recent: session.messages.slice(cut),
  };
}
export async function forkAt(
  session: ChatSession,
  throughId: string,
  compact?: string,
) {
  const [
    { useChatStore, createMessage },
    { currentIdentity },
    { copyReferenceDocuments },
  ] = await Promise.all([
    import("../store/chat"),
    import("./identity-storage"),
    import("./local-rag"),
  ]);
  const owner = currentIdentity();
  if (owner === "locked") throw new Error("请先登录。");
  const messages =
    compact === undefined
      ? branchMessages(session.messages, throughId)
      : [
          createMessage({ role: "user", content: compact }),
          ...clone(compactionSlice(session).recent).map((m) => ({
            ...m,
            id: nanoid(),
          })),
        ];
  const store = useChatStore.getState();
  store.newSession(clone(session.mask));
  const next = store.currentSession();
  store.updateTargetSession(next, (s) => {
    s.topic = `${session.topic} · ${compact === undefined ? "分支" : "浓缩"}`;
    s.messages = messages;
    s.webSearch = session.webSearch;
    s.workflowId = session.workflowId;
    s.memoryPrompt = "";
    s.lastSummarizeIndex = 0;
    s.clearContextIndex = 0;
    s.lastUpdate = Date.now();
  });
  // Same identity only; retaining originals also keeps citation jumps working in the sibling.
  await copyReferenceDocuments(session.id, next.id);
  if (owner !== currentIdentity()) throw new Error("身份已切换。");
  return next.id;
}
