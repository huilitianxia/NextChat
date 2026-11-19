import type { RequestMessage } from "../client/api";
import { chatMessagesBytes, fileSizeLabel } from "./attachment-policy";

export const CHAT_HISTORY_BUDGET = 3.5 * 1024 * 1024;

function hasAttachment({ content }: RequestMessage) {
  if (typeof content === "string") return content.includes("[附件：");
  return content.some(
    (part) => part.type === "image_url" || part.text?.includes("[附件："),
  );
}

export function fitChatHistory(
  messages: RequestMessage[],
  limit = CHAT_HISTORY_BUDGET,
) {
  const originalBytes = chatMessagesBytes(messages);
  if (originalBytes <= limit) return { messages, removed: 0 };

  const turns: RequestMessage[][] = [];
  let turn: RequestMessage[] | undefined;
  for (const message of messages) {
    if (!turn || message.role === "user") {
      turn = [];
      turns.push(turn);
    }
    turn.push(message);
  }

  const emptyEnvelope = chatMessagesBytes([]);
  const omitted = new Set<RequestMessage[]>();
  let bytes = originalBytes;
  for (const group of turns.slice(0, -3)) {
    if (bytes <= limit) break;
    if (
      group.some(
        (m) =>
          (m.role !== "user" && m.role !== "assistant") || hasAttachment(m),
      )
    )
      continue;
    bytes -= chatMessagesBytes(group) - emptyEnvelope + 1;
    omitted.add(group);
  }

  const selected = turns.filter((group) => !omitted.has(group)).flat();
  const selectedBytes = chatMessagesBytes(selected);
  if (selectedBytes > limit) {
    throw new Error(
      "当前会话附件过大，建议开启新对话继续追问。" +
        "保留附件和最近对话后约 " +
        fileSizeLabel(selectedBytes) +
        "，单次目标上限 " +
        fileSizeLabel(limit) +
        "。草稿与附件已保留。",
    );
  }
  return { messages: selected, removed: omitted.size };
}
