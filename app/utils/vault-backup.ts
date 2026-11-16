import { currentIdentity } from "./identity-storage";
import { listKnowledge, updateKnowledge } from "./knowledge-vault";
import {
  StudyPayload,
  planStudyMerge,
  validateStudyPayload,
} from "./vault-merge";
export async function collectStudyData(): Promise<StudyPayload> {
  if (typeof window === "undefined" || currentIdentity() === "locked")
    throw new Error("请先登录。");
  const owner = currentIdentity(),
    [
      { useChatStore },
      { useFinale },
      { useWorkspacePreferences },
      { buildConversationExport },
      { cacheImageToBase64Image },
    ] = await Promise.all([
      import("../store/chat"),
      import("../store/finale"),
      import("../store/workspace-preferences"),
      import("./friend-export"),
      import("./chat"),
    ]);
  const snapshot = JSON.parse(JSON.stringify(useChatStore.getState().sessions)),
    macros = useFinale.getState().macros.map((m) => ({ ...m })),
    { mode, palette } = useWorkspacePreferences.getState(),
    notes = await listKnowledge();
  const chats = await buildConversationExport(snapshot, async (url) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        cacheImageToBase64Image(url),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("图片缓存读取超时。")),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  });
  if (owner !== currentIdentity()) throw new Error("身份已切换，导出已取消。");
  return validateStudyPayload({
    format: "campus-study-data",
    version: 1,
    createdAt: new Date().toISOString(),
    sessions: chats.sessions,
    notes,
    macros,
    appearance: { mode, palette },
  });
}
export async function importStudyData(
  payload: StudyPayload,
  applyAppearance: boolean,
) {
  if (typeof window === "undefined" || currentIdentity() === "locked")
    throw new Error("请先登录。");
  const owner = currentIdentity(),
    incoming = validateStudyPayload(payload),
    [{ useChatStore }, { useFinale }, { useWorkspacePreferences }] =
      await Promise.all([
        import("../store/chat"),
        import("../store/finale"),
        import("../store/workspace-preferences"),
      ]);
  const local = await collectStudyData();
  const plan = planStudyMerge(local, incoming);
  if (owner !== currentIdentity()) throw new Error("身份已切换，导入已取消。");
  // Store notes first; failures cannot overwrite existing conversations. Existing IDs are never mutated.
  await updateKnowledge(
    (notes) => planStudyMerge({ ...local, notes }, incoming).notes.items,
  );
  if (owner !== currentIdentity()) throw new Error("身份已切换，导入已取消。");
  useFinale.getState().saveMacros(plan.macros.items);
  for (const portable of plan.sessions.added) {
    const store = useChatStore.getState();
    store.newSession();
    const target = store.currentSession();
    store.updateTargetSession(target, (s) => {
      s.id = portable.id;
      s.topic = portable.topic;
      s.messages = portable.messages;
      s.memoryPrompt = portable.memoryPrompt;
      s.lastUpdate = portable.lastUpdate;
      s.lastSummarizeIndex = 0;
    });
  }
  if (applyAppearance)
    useWorkspacePreferences.getState().setPreferences(incoming.appearance);
  return {
    sessions: plan.sessions.added.length,
    notes: plan.notes.added.length,
    macros: plan.macros.added,
    conflicts:
      plan.sessions.conflicts + plan.notes.conflicts + plan.macros.conflicts,
    skipped: plan.sessions.skipped + plan.notes.skipped + plan.macros.skipped,
  };
}
