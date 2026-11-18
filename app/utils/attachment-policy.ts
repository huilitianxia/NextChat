import type { RequestMessage } from "../client/api";
import { CACHE_URL_PREFIX } from "../constant";

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const STANDARD_ATTACHMENT_CHARACTERS = 50_000;
export const MAX_CHAT_REQUEST_BYTES = 4 * 1024 * 1024;
// A pre-existing cached image is converted to a data URL of at most this size on send.
export const INLINE_IMAGE_LIMIT = 256 * 1024;

export function attachmentBudget(model: string, windowSize?: number) {
  // The context meter can select 256k on a model that supports a larger window.
  const supports1M = /^(?:gpt-6(?:[.-]|$)|gpt-(?:4\.1|5\.[456])(?:-|$))/i.test(
    model,
  );
  const use256k = supports1M
    ? windowSize === 256_000
    : /^gpt-5(?:\.[0123])?(?:-(?:mini|nano|pro|\d{4}-\d{2}-\d{2}))*$/i.test(
        model,
      );
  const use1M = supports1M && !use256k;
  return {
    model,
    label: use1M ? "1M" : use256k ? "256k" : "常规",
    limit: use1M ? 500_000 : use256k ? 150_000 : STANDARD_ATTACHMENT_CHARACTERS,
    hint: use1M
      ? ""
      : supports1M
      ? "将上下文切换至 1M，可添加最多 500,000 字符。"
      : "切换到支持 1M 上下文的模型，可添加最多 500,000 字符。",
  };
}

export type AttachmentBudget = ReturnType<typeof attachmentBudget>;

export const numberLabel = (count: number) => count.toLocaleString("zh-CN");

export function fileSizeLabel(bytes: number) {
  if (bytes < 1024 * 1024) return `${numberLabel(bytes)} 字节`;
  return `${numberLabel(bytes / (1024 * 1024))} MB（${numberLabel(
    bytes,
  )} 字节）`;
}

export function attachmentLimitLabel(budget: AttachmentBudget) {
  return `当前模型 ${budget.model}（${
    budget.label
  }）每条消息的附件文字上限为 ${numberLabel(budget.limit)} 字符。`;
}

export function attachmentCharacterCount(text: string) {
  const pairs = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  let count = text.length;
  while (pairs.test(text)) count--;
  return count;
}

export function attachmentCharacters(documents: readonly { text: string }[]) {
  return documents.reduce(
    (sum, { text }) => sum + attachmentCharacterCount(text),
    0,
  );
}

function characterPrefix(text: string, limit: number) {
  let end = 0;
  for (let count = 0; count < limit && end < text.length; count++) {
    end += text.codePointAt(end)! > 0xffff ? 2 : 1;
  }
  return text.slice(0, end);
}

// For paged/structured documents, count every extracted character while keeping
// only the prefix that can be attached. The browser need not join the full book.
export class AttachmentTextBuffer {
  private parts: string[] = [];
  characterCount = 0;

  constructor(private readonly limit: number) {}

  append(text: string) {
    const size = attachmentCharacterCount(text);
    const remaining = this.limit - this.characterCount;
    if (size && remaining > 0) {
      this.parts.push(
        size <= remaining ? text : characterPrefix(text, remaining),
      );
    }
    this.characterCount += size;
  }

  get text() {
    return this.parts.join("");
  }
}

export function attachmentOverflowLabel(
  characters: number,
  budget: AttachmentBudget,
  alreadyAttached = 0,
) {
  const used = alreadyAttached
    ? `已添加 ${numberLabel(alreadyAttached)} 字符，本条还可添加 ${numberLabel(
        Math.max(0, budget.limit - alreadyAttached),
      )} 字符。`
    : "";
  return `当前文字 ${numberLabel(characters)} 字符。${attachmentLimitLabel(
    budget,
  )}${used}${budget.hint}`;
}

export function attachmentPrefixPercent(kept: number, total: number) {
  const percent = Math.min(99.99, Math.floor((kept * 10_000) / total) / 100);
  return percent > 0 ? `${numberLabel(percent)}%` : "不到 0.01%";
}

export function chatMessagesBytes(messages: readonly RequestMessage[]) {
  let cachedImages = 0;
  const content = messages.map(({ role, content }) => {
    if (Array.isArray(content)) {
      for (const part of content) {
        if (
          part.type === "image_url" &&
          part.image_url?.url.includes(CACHE_URL_PREFIX)
        ) {
          cachedImages++;
        }
      }
    }
    return { role, content };
  });
  // Leave room for model, streaming and reasoning options, including the search route.
  return (
    new Blob([JSON.stringify({ messages: content })]).size +
    cachedImages * INLINE_IMAGE_LIMIT +
    512
  );
}
