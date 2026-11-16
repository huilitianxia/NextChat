import { get, set } from "idb-keyval";
import { currentIdentity, identityStorageKey } from "./identity-storage";
export type KnowledgeNote = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  source?: { sessionId: string; messageId?: string };
};
export function normalizeTags(input: string | string[]) {
  return [
    ...new Set(
      (Array.isArray(input) ? input : input.split(/[#,，;；\s]+/))
        .map((s) => s.replace(/^#+/, "").trim().slice(0, 32))
        .filter(Boolean),
    ),
  ].slice(0, 12);
}
export function validateNote(value: any): KnowledgeNote {
  if (
    !value ||
    typeof value.id !== "string" ||
    !value.id ||
    value.id.length > 160 ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    value.title.length > 200 ||
    typeof value.content !== "string" ||
    !value.content.trim() ||
    value.content.length > 120000 ||
    !Array.isArray(value.tags) ||
    value.tags.some((s: any) => typeof s !== "string") ||
    !Number.isFinite(value.createdAt) ||
    !Number.isFinite(value.updatedAt)
  )
    throw new Error("知识笔记格式无效。");
  const source =
    value.source && typeof value.source.sessionId === "string"
      ? {
          sessionId: value.source.sessionId.slice(0, 160),
          ...(typeof value.source.messageId === "string"
            ? { messageId: value.source.messageId.slice(0, 160) }
            : {}),
        }
      : undefined;
  return {
    id: value.id,
    title: value.title.trim(),
    content: value.content,
    tags: normalizeTags(value.tags),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(source ? { source } : {}),
  };
}
export const knowledgeKey = (owner = currentIdentity()) =>
  identityStorageKey("knowledge-vault", owner);
function owner() {
  const id = currentIdentity();
  if (typeof window === "undefined" || id === "locked")
    throw new Error("请先登录再使用知识手账。");
  return id;
}
export async function listKnowledge() {
  const id = owner(),
    notes = (await get(knowledgeKey(id))) || [];
  if (currentIdentity() !== id) throw new Error("身份已切换。");
  return (notes as unknown[]).map(validateNote);
}
let queue = Promise.resolve();
export function updateKnowledge(
  update: (notes: KnowledgeNote[]) => KnowledgeNote[],
) {
  const id = owner();
  const next = queue
    .catch(() => {})
    .then(async () => {
      if (currentIdentity() !== id) throw new Error("身份已切换。");
      const notes = update(
        ((await get(knowledgeKey(id))) || []).map(validateNote),
      ).map(validateNote);
      if (notes.length > 2000) throw new Error("知识手账最多 2,000 条笔记。");
      if (currentIdentity() !== id) throw new Error("身份已切换。");
      await set(knowledgeKey(id), notes);
      return notes;
    });
  queue = next.then(
    () => {},
    () => {},
  );
  return next;
}
export async function saveKnowledge(
  input: Omit<KnowledgeNote, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
) {
  const now = Date.now();
  return updateKnowledge((notes) => {
    const old = notes.find((n) => n.id === input.id);
    const note = validateNote({
      ...input,
      id: old?.id || crypto.randomUUID(),
      createdAt: old?.createdAt || now,
      updatedAt: now,
    });
    return old
      ? notes.map((n) => (n.id === old.id ? note : n))
      : [note, ...notes];
  });
}
export const removeKnowledge = (id: string) =>
  updateKnowledge((notes) => notes.filter((n) => n.id !== id));
export function filterKnowledge(
  notes: KnowledgeNote[],
  tag: string,
  query = "",
) {
  const q = query.trim().toLowerCase();
  return notes
    .filter(
      (n) =>
        (!tag || n.tags.includes(tag)) &&
        (!q || `${n.title}\n${n.content}`.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
