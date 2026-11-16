import { KnowledgeNote, validateNote } from "./knowledge-vault";
import { PromptMacro, validateMacros } from "./slash-commands";
import { specialistId } from "../config/workflow-specialists";
import { ContextSummary, normalizeSummary } from "./context-compaction";
export type PortableSession = {
  workflowId?: string;
  contextWindow?: 1000000 | 256000;
  autoCompact?: boolean;
  clearContextIndex?: number;
  contextSummary?: ContextSummary;
  id: string;
  topic: string;
  messages: any[];
  memoryPrompt: string;
  lastUpdate: number;
};
export type StudyPayload = {
  format: "campus-study-data";
  version: 1;
  createdAt: string;
  sessions: PortableSession[];
  notes: KnowledgeNote[];
  macros: PromptMacro[];
  appearance: {
    mode: "light" | "dark" | "auto";
    palette: "green" | "blue" | "purple" | "paper";
  };
};
const safeId = (value: any) =>
  typeof value === "string" && /^[\p{L}\p{N}_-]{1,160}$/u.test(value);
function portableMessage(m: any) {
  if (
    !m ||
    !safeId(m.id) ||
    !["user", "assistant", "system"].includes(m.role) ||
    !(typeof m.content === "string" || Array.isArray(m.content))
  )
    throw new Error("漫游对话消息无效。");
  let content = m.content;
  if (typeof content === "string") {
    if (content.length > 2000000) throw new Error("单条消息过长。");
  } else {
    if (content.length > 24) throw new Error("消息附件数量过多。");
    content = content.map((part: any) => {
      if (
        part?.type === "text" &&
        typeof part.text === "string" &&
        part.text.length < 2000000
      )
        return { type: "text", text: part.text };
      if (
        part?.type === "image_url" &&
        typeof part.image_url?.url === "string" &&
        /^(?:data:image\/(?:png|jpeg|webp|gif);base64,|https?:\/\/)/i.test(
          part.image_url.url,
        )
      )
        return { type: "image_url", image_url: { url: part.image_url.url } };
      throw new Error("漫游包含不可移植的附件，请重新导出。");
    });
  }
  const message: any = {
    id: m.id,
    role: m.role,
    content,
    date: typeof m.date === "string" ? m.date.slice(0, 100) : "",
    streaming: false,
  };
  for (const key of ["model", "searchNotice"]) {
    if (typeof m[key] === "string") message[key] = m[key].slice(0, 5000);
  }
  if (Array.isArray(m.sources))
    message.sources = m.sources
      .slice(0, 20)
      .filter(
        (s: any) =>
          s && typeof s.text === "string" && typeof s.label === "string",
      )
      .map((s: any) => ({
        id: String(s.id).slice(0, 160),
        documentId: String(s.documentId).slice(0, 160),
        name: String(s.name).slice(0, 300),
        text: s.text.slice(0, 10000),
        label: s.label.slice(0, 400),
        ...(Number.isInteger(s.page) && s.page > 0 ? { page: s.page } : {}),
        ...(Number.isInteger(s.paragraph) && s.paragraph > 0
          ? { paragraph: s.paragraph }
          : {}),
      }));
  if (Array.isArray(m.webSources))
    message.webSources = m.webSources
      .filter(
        (s: any) => typeof s?.url === "string" && /^https?:\/\//i.test(s.url),
      )
      .slice(0, 30)
      .map((s: any) => ({
        url: s.url.slice(0, 4000),
        title: String(s.title || "").slice(0, 300),
      }));
  if (["low", "medium", "high", "xhigh"].includes(m.reasoningEffort))
    message.reasoningEffort = m.reasoningEffort;
  if (Number.isFinite(m.reasoningDurationMs))
    message.reasoningDurationMs = m.reasoningDurationMs;
  if (
    m.imageRevision &&
    ["before", "after"].every(
      (key) =>
        typeof m.imageRevision[key] === "string" &&
        /^(?:data:image\/(?:png|jpeg|webp);base64,|https?:\/\/)/i.test(
          m.imageRevision[key],
        ),
    )
  )
    message.imageRevision = {
      before: m.imageRevision.before,
      after: m.imageRevision.after,
      prompt: String(m.imageRevision.prompt || ""),
      model: String(m.imageRevision.model || ""),
    };
  return message;
}
export function validateStudyPayload(value: any): StudyPayload {
  if (
    !value ||
    value.format !== "campus-study-data" ||
    value.version !== 1 ||
    !Array.isArray(value.sessions) ||
    value.sessions.length > 1000 ||
    !Array.isArray(value.notes) ||
    value.notes.length > 2000
  )
    throw new Error("漫游数据格式或数量无效。");
  const sessionIds = new Set<string>(),
    noteIds = new Set<string>();
  const sessions = value.sessions.map((s: any): PortableSession => {
    if (
      !s ||
      !safeId(s.id) ||
      sessionIds.has(s.id) ||
      typeof s.topic !== "string" ||
      !Array.isArray(s.messages) ||
      s.messages.length > 20000
    )
      throw new Error("会话 ID、标题或消息列表无效。");
    sessionIds.add(s.id);
    const messages = s.messages.map(portableMessage);
    if (new Set(messages.map((m: any) => m.id)).size !== messages.length)
      throw new Error("会话内消息 ID 重复。");
    return {
      id: s.id,
      topic: s.topic.slice(0, 200),
      messages,
      memoryPrompt:
        typeof s.memoryPrompt === "string"
          ? s.memoryPrompt.slice(0, 60000)
          : "",
      lastUpdate: Number.isFinite(s.lastUpdate) ? s.lastUpdate : 0,
      ...(specialistId(s.workflowId)
        ? { workflowId: specialistId(s.workflowId) }
        : {}),
      ...([1000000, 256000].includes(s.contextWindow)
        ? { contextWindow: s.contextWindow }
        : {}),
      ...(typeof s.autoCompact === "boolean"
        ? { autoCompact: s.autoCompact }
        : {}),
      ...(Number.isInteger(s.clearContextIndex) &&
      s.clearContextIndex >= 0 &&
      s.clearContextIndex <= messages.length
        ? { clearContextIndex: s.clearContextIndex }
        : {}),
      ...(normalizeSummary(s.contextSummary)
        ? { contextSummary: normalizeSummary(s.contextSummary) }
        : {}),
    };
  });
  const notes = value.notes.map((n: any) => {
    const note = validateNote(n);
    if (noteIds.has(note.id)) throw new Error("知识笔记 ID 重复。");
    noteIds.add(note.id);
    return note;
  });
  const appearance = {
    mode: ["light", "dark", "auto"].includes(value.appearance?.mode)
      ? value.appearance.mode
      : "auto",
    palette: ["green", "blue", "purple", "paper"].includes(
      value.appearance?.palette,
    )
      ? value.appearance.palette
      : "green",
  };
  const macros = validateMacros(value.macros);
  if (
    macros.some((m) => !safeId(m.id)) ||
    new Set(macros.map((m) => m.id)).size !== macros.length
  )
    throw new Error("快捷指令 ID 无效或重复。");
  return {
    format: "campus-study-data",
    version: 1,
    createdAt:
      typeof value.createdAt === "string" ? value.createdAt.slice(0, 100) : "",
    sessions,
    notes,
    macros,
    appearance,
  };
}
function canonical(record: any) {
  const copy = { ...record };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.lastUpdate;
  return JSON.stringify(copy);
}
function fingerprint(text: string) {
  let hash = 14695981039346656037n;
  for (const c of text) {
    hash ^= BigInt(c.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(36);
}
export function mergeById<T extends { id: string }>(
  local: T[],
  incoming: T[],
  limit = 2000,
) {
  const items = local.slice(),
    map = new Map(items.map((i) => [i.id, i])),
    mapping: Record<string, string> = Object.create(null),
    added: T[] = [];
  let skipped = 0,
    conflicts = 0;
  for (const record of incoming) {
    const old = map.get(record.id),
      body = canonical(record);
    if (old && canonical(old) === body) {
      skipped++;
      mapping[record.id] = old.id;
      continue;
    }
    let id = record.id;
    if (old) {
      id = record.id.slice(0, 100) + "-import-" + fingerprint(body);
      let n = 1;
      while (map.has(id) && canonical(map.get(id)) !== body)
        id =
          record.id.slice(0, 90) + "-import-" + fingerprint(body) + "-" + n++;
      if (map.has(id)) {
        skipped++;
        mapping[record.id] = id;
        continue;
      }
      conflicts++;
    }
    const copy = { ...record, id };
    items.push(copy);
    added.push(copy);
    map.set(id, copy);
    mapping[record.id] = id;
  }
  if (items.length > limit)
    throw new Error("合并后记录过多，请先减少选中的内容。");
  return { items, added, mapping, skipped, conflicts };
}
export function mergeMacros(local: PromptMacro[], incoming: PromptMacro[]) {
  const items = local.slice();
  let added = 0,
    skipped = 0,
    conflicts = 0;
  for (const macro of incoming) {
    const old = items.find(
      (m) =>
        m.id === macro.id || m.name.toLowerCase() === macro.name.toLowerCase(),
    );
    if (!old) {
      items.push(macro);
      added++;
      continue;
    }
    if (
      old.prompt === macro.prompt ||
      items.some(
        (m) =>
          m.prompt === macro.prompt &&
          m.name.startsWith(macro.name.slice(0, 16) + "_导入"),
      )
    ) {
      skipped++;
      continue;
    }
    const base = macro.name.slice(0, 16) + "_导入";
    let name = base,
      i = 2;
    while (items.some((m) => m.name.toLowerCase() === name.toLowerCase()))
      name = base + i++;
    const idBase = macro.id.slice(0, 80) + "-" + fingerprint(macro.prompt);
    let id = idBase,
      suffix = 2;
    while (items.some((m) => m.id === id)) id = idBase + "-" + suffix++;
    items.push({
      ...macro,
      id,
      name,
    });
    added++;
    conflicts++;
  }
  return { items: validateMacros(items), added, skipped, conflicts };
}
export function planStudyMerge(
  local: {
    sessions: PortableSession[];
    notes: KnowledgeNote[];
    macros: PromptMacro[];
  },
  incoming: StudyPayload,
) {
  const sessions = mergeById(local.sessions, incoming.sessions, 1000),
    remapped = incoming.notes.map((n) => ({
      ...n,
      ...(n.source
        ? {
            source: {
              ...n.source,
              sessionId:
                sessions.mapping[n.source.sessionId] || n.source.sessionId,
            },
          }
        : {}),
    })),
    notes = mergeById(local.notes, remapped),
    macros = mergeMacros(local.macros, incoming.macros);
  return { sessions, notes, macros };
}
