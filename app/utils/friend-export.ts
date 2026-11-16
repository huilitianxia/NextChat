import type { ChatSession } from "../store/chat";
import { CACHE_URL_PREFIX } from "../constant";
import { activeSummary, historyDigest } from "./context-compaction";

/** Include cached attachments, but never export access state or provider credentials. */
export async function buildConversationExport(
  sessions: ChatSession[],
  resolveImage: (url: string) => Promise<string>,
) {
  const images = new Map<string, string>();
  const exported = [];
  for (const session of sessions) {
    const messages = [];
    for (const message of session.messages) {
      let content = message.content;
      if (Array.isArray(content)) {
        const parts = [];
        for (const part of content) {
          const url = part.image_url?.url;
          if (part.type === "image_url" && url?.includes(CACHE_URL_PREFIX)) {
            let image = images.get(url);
            if (!image) {
              image = await resolveImage(url);
              if (!image.startsWith("data:image/")) {
                throw new Error(
                  "附件缓存不可用，导出已取消。请先检查历史图片是否能正常显示。",
                );
              }
              images.set(url, image);
            }
            parts.push({
              ...part,
              image_url: { ...part.image_url, url: image },
            });
          } else {
            parts.push({ ...part });
          }
        }
        content = parts;
      }
      let imageRevision = message.imageRevision;
      if (imageRevision) {
        imageRevision = { ...imageRevision };
        for (const key of ["before", "after"] as const) {
          if (imageRevision[key].includes(CACHE_URL_PREFIX))
            imageRevision[key] = await resolveImage(imageRevision[key]);
        }
      }
      messages.push({
        ...message,
        content,
        ...(imageRevision ? { imageRevision } : {}),
      });
    }
    const compacted = activeSummary(session);
    exported.push({
      id: session.id,
      topic: session.topic,
      messages,
      memoryPrompt: session.memoryPrompt,
      lastUpdate: session.lastUpdate,
      workflowId: session.workflowId,
      contextWindow: session.contextWindow,
      autoCompact: session.autoCompact,
      clearContextIndex: session.clearContextIndex,
      contextSummary: compacted
        ? {
            ...compacted.summary,
            digest: historyDigest(
              messages.slice(
                compacted.summary.startIndex,
                compacted.through + 1,
              ),
            ),
          }
        : undefined,
    });
  }
  return {
    format: "nextchat-conversations",
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: exported,
  };
}
