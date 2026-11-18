import { currentIdentity } from "./identity-storage";
import {
  compactionPlan,
  createContextSummary,
  summarizeTranscript,
} from "./context-compaction";
import { contextWindow } from "./context-meter";
import { useContextOperations } from "../store/context-operations";
import { DEFAULT_CHAT_MODEL, ServiceProvider } from "../constant";
export async function semanticCompaction(sessionId: string, apply = false) {
  if (typeof window === "undefined" || currentIdentity() === "locked")
    throw new Error("请先登录后使用智能浓缩。");
  if (useContextOperations.getState().sessionId)
    throw new Error("已有浓缩任务正在执行。");
  const owner = currentIdentity(),
    cancel = new AbortController();
  const cancelOperation = () => cancel.abort();
  useContextOperations.setState({
    sessionId,
    progress: "正在准备历史…",
    cancel: cancelOperation,
  });
  try {
    const [{ useChatStore }, { getClientApi }] = await Promise.all([
        import("../store/chat"),
        import("../client/api"),
      ]),
      session = useChatStore
        .getState()
        .sessions.find((s) => s.id === sessionId);
    if (!session || owner !== currentIdentity())
      throw new Error("会话或身份已变化。");
    const plan = compactionPlan(session);
    const check = () => {
      if (
        cancel.signal.aborted ||
        owner !== currentIdentity() ||
        useChatStore.getState().currentSession().id !== sessionId
      )
        throw new Error("浓缩已取消；原始记录保持完整。");
    };
    const api = getClientApi(ServiceProvider.OpenAI);
    const call = (system: string, input: string) =>
      new Promise<string>((resolve, reject) => {
        try {
          check();
        } catch (e) {
          reject(e);
          return;
        }
        let controller: AbortController | undefined,
          done = false;
        const finish = (error?: Error, text?: string) => {
          if (done) return;
          done = true;
          cancel.signal.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve(text || "");
        };
        const abort = () => {
          controller?.abort();
          finish(new Error("浓缩已取消；原始记录保持完整。"));
        };
        cancel.signal.addEventListener("abort", abort, { once: true });
        void api.llm
          .chat({
            messages: [
              { role: "system", content: system },
              { role: "user", content: input },
            ],
            config: {
              model: DEFAULT_CHAT_MODEL,
              providerName: ServiceProvider.OpenAI,
              stream: true,
              webSearch: false,
              reasoningEffort: "low",
            },
            onController(c) {
              controller = c;
              if (cancel.signal.aborted) c.abort();
            },
            onFinish(text, response) {
              try {
                check();
                if (!response?.ok)
                  throw new Error("智能浓缩请求失败，原始记录未改动。");
                finish(undefined, text);
              } catch (e) {
                finish(e as Error);
              }
            },
            onError(error) {
              finish(error);
            },
          })
          .catch((error) => finish(error));
      });
    const text = await summarizeTranscript(
      plan.text,
      call,
      contextWindow(session.contextWindow),
      (progress) => useContextOperations.setState({ progress }),
    );
    check();
    if (apply) {
      const current = useChatStore
        .getState()
        .sessions.find((s) => s.id === sessionId)!;
      const summary = createContextSummary(current, plan, text, "ai");
      useChatStore.getState().updateTargetSession(current, (s) => {
        s.contextSummary = summary;
      });
    }
    return { text, plan };
  } finally {
    if (useContextOperations.getState().cancel === cancelOperation)
      useContextOperations.setState({
        sessionId: null,
        progress: "",
        cancel: null,
      });
  }
}
