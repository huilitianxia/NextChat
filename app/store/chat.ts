import { useWorkspacePreferences } from "./workspace-preferences";
import { ReasoningEffort, splitReasoning } from "../utils/reasoning";
import { getMessageTextContent, isDalle3, trimTopic } from "../utils";

import { nanoid } from "nanoid";
import type {
  ChatOptions,
  ClientApi,
  MultimodalContent,
  RequestMessage,
} from "../client/api";
import { getClientApi } from "../client/api";
import { ChatControllerPool } from "../client/controller";
import {
  CHAT_INTERRUPTED_MESSAGE,
  GATEWAY_TIMEOUT_MESSAGE,
  isChatNetworkInterruption,
  isGatewayTimeout,
} from "../utils/chat-stream-protocol";
import { showToast } from "../components/ui-lib";
import {
  DEFAULT_INPUT_TEMPLATE,
  DEFAULT_MODELS,
  DEFAULT_SYSTEM_TEMPLATE,
  GEMINI_SUMMARIZE_MODEL,
  DEEPSEEK_SUMMARIZE_MODEL,
  KnowledgeCutOffDate,
  ServiceProvider,
  StoreKey,
  SUMMARIZE_MODEL,
} from "../constant";
import Locale, { getLang } from "../locales";
import { prettyObject } from "../utils/format";
import { createPersistStore } from "../utils/store";
import { estimateTokenLength } from "../utils/token";
import { ModelConfig, ModelType, useAppConfig } from "./config";
import { useAccessStore } from "./access";
import { collectModelsWithDefaultModel } from "../utils/model";
import { createEmptyMask, Mask } from "./mask";
import type {
  SourceChunk,
  WebSource,
  ImageRevision,
} from "../utils/campus-types";
import { assertSafePrompt } from "../utils/security-guard";
import { fitChatHistory } from "../utils/chat-payload";
import { ENGINEERING_PLOT_PROMPT } from "../utils/engineering-prompt";
import {
  currentIdentity,
  identityChanging,
  identityStorageKey,
} from "../utils/identity-storage";
import { reportStorageError } from "../utils/indexedDB-storage";
import { workflowInstruction } from "../config/workflow-templates";
import {
  activeSummary,
  compactionPlan,
  ContextSummary,
} from "../utils/context-compaction";
import {
  contextWindow,
  ContextWindow,
  composeRequest,
  estimateContext,
  tokenGauge,
} from "../utils/context-meter";

export type ChatMessageTool = {
  id: string;
  index?: number;
  type?: string;
  function?: {
    name: string;
    arguments?: string;
  };
  content?: string;
  isError?: boolean;
  errorMsg?: string;
};

export type ChatMessage = RequestMessage & {
  omittedHistoryTurns?: number;
  reasoningEffort?: ReasoningEffort;
  reasoningFallback?: boolean;
  reasoningStartedAt?: number;
  reasoningDurationMs?: number;
  sources?: SourceChunk[];
  webSources?: WebSource[];
  searchNotice?: string;
  imageRevision?: ImageRevision;
  date: string;
  streaming?: boolean;
  isError?: boolean;
  id: string;
  model?: ModelType;
  tools?: ChatMessageTool[];
  audio_url?: string;
  isMcpResponse?: boolean;
};

export function createMessage(override: Partial<ChatMessage>): ChatMessage {
  return {
    id: nanoid(),
    date: new Date().toLocaleString(),
    role: "user",
    content: "",
    ...override,
  };
}

export interface ChatStat {
  tokenCount: number;
  wordCount: number;
  charCount: number;
}

export interface ChatSession {
  contextWindow?: ContextWindow;
  autoCompact?: boolean;
  contextSummary?: ContextSummary;
  workflowId?: string;
  webSearch?: boolean;
  initialPrompt?: string;
  id: string;
  topic: string;

  memoryPrompt: string;
  messages: ChatMessage[];
  stat: ChatStat;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndex?: number;

  mask: Mask;
}

export const DEFAULT_TOPIC = Locale.Store.DefaultTopic;
export const BOT_HELLO: ChatMessage = createMessage({
  role: "assistant",
  content: Locale.Store.BotHello,
});

function createEmptySession(): ChatSession {
  return {
    id: nanoid(),
    topic: DEFAULT_TOPIC,
    memoryPrompt: "",
    messages: [],
    stat: {
      tokenCount: 0,
      wordCount: 0,
      charCount: 0,
    },
    lastUpdate: Date.now(),
    lastSummarizeIndex: 0,

    mask: createEmptyMask(),
  };
}

function getSummarizeModel(
  currentModel: string,
  providerName: string,
): string[] {
  // if it is using gpt-* models, force to use 4o-mini to summarize
  if (currentModel.startsWith("gpt") || currentModel.startsWith("chatgpt")) {
    const configStore = useAppConfig.getState();
    const accessStore = useAccessStore.getState();
    const allModel = collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
    const summarizeModel = allModel.find(
      (m) => m.name === SUMMARIZE_MODEL && m.available,
    );
    if (summarizeModel) {
      return [
        summarizeModel.name,
        summarizeModel.provider?.providerName as string,
      ];
    }
  }
  if (currentModel.startsWith("gemini")) {
    return [GEMINI_SUMMARIZE_MODEL, ServiceProvider.Google];
  } else if (currentModel.startsWith("deepseek-")) {
    return [DEEPSEEK_SUMMARIZE_MODEL, ServiceProvider.DeepSeek];
  }

  return [currentModel, providerName];
}

function countMessages(msgs: ChatMessage[]) {
  return msgs.reduce(
    (pre, cur) => pre + estimateTokenLength(getMessageTextContent(cur)),
    0,
  );
}

export function fillTemplateWith(input: string, modelConfig: ModelConfig) {
  const cutoff =
    KnowledgeCutOffDate[modelConfig.model] ?? KnowledgeCutOffDate.default;
  // Find the model in the DEFAULT_MODELS array that matches the modelConfig.model
  const modelInfo = DEFAULT_MODELS.find((m) => m.name === modelConfig.model);

  var serviceProvider = "OpenAI";
  if (modelInfo) {
    // TODO: auto detect the providerName from the modelConfig.model

    // Directly use the providerName from the modelInfo
    serviceProvider = modelInfo.provider.providerName;
  }

  const vars = {
    ServiceProvider: serviceProvider,
    cutoff,
    model: modelConfig.model,
    time: new Date().toString(),
    lang: getLang(),
    input: input,
  };

  let output = modelConfig.template ?? DEFAULT_INPUT_TEMPLATE;

  // remove duplicate
  if (input.startsWith(output)) {
    output = "";
  }

  // must contains {{input}}
  const inputVar = "{{input}}";
  if (!output.includes(inputVar)) {
    output += "\n" + inputVar;
  }

  Object.entries(vars).forEach(([name, value]) => {
    const regex = new RegExp(`{{${name}}}`, "g");
    output = output.replace(regex, value.toString()); // Ensure value is a string
  });

  return output;
}

async function getMcpSystemPrompt(_accessCode: string): Promise<string> {
  return "";
}

const DEFAULT_CHAT_STATE = {
  sessions: [createEmptySession()],
  currentSessionIndex: 0,
  lastInput: "",
};
const SESSION_INDEX_KEY = "chat-session-index";

export const useChatStore = createPersistStore(
  DEFAULT_CHAT_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      forkSession() {
        // 获取当前会话
        const currentSession = get().currentSession();
        if (!currentSession) return;

        const newSession = createEmptySession();

        newSession.topic = currentSession.topic;
        // 深拷贝消息
        newSession.messages = currentSession.messages.map((msg) => ({
          ...msg,
          id: nanoid(), // 生成新的消息 ID
        }));
        newSession.mask = {
          ...currentSession.mask,
          modelConfig: {
            ...currentSession.mask.modelConfig,
          },
        };

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [newSession, ...state.sessions],
        }));
      },

      clearSessions() {
        set(() => ({
          sessions: [createEmptySession()],
          currentSessionIndex: 0,
        }));
      },

      selectSession(index: number) {
        set({
          currentSessionIndex: index,
        });
      },

      moveSession(from: number, to: number) {
        set((state) => {
          const { sessions, currentSessionIndex: oldIndex } = state;

          // move the session
          const newSessions = [...sessions];
          const session = newSessions[from];
          newSessions.splice(from, 1);
          newSessions.splice(to, 0, session);

          // modify current session id
          let newIndex = oldIndex === from ? to : oldIndex;
          if (oldIndex > from && oldIndex <= to) {
            newIndex -= 1;
          } else if (oldIndex < from && oldIndex >= to) {
            newIndex += 1;
          }

          return {
            currentSessionIndex: newIndex,
            sessions: newSessions,
          };
        });
      },

      newSession(mask?: Mask) {
        const session = createEmptySession();

        if (mask) {
          const config = useAppConfig.getState();
          const globalModelConfig = config.modelConfig;

          session.mask = {
            ...mask,
            modelConfig: {
              ...globalModelConfig,
              ...mask.modelConfig,
            },
          };
          session.topic = mask.name;
        }

        set((state) => ({
          currentSessionIndex: 0,
          sessions: [session].concat(state.sessions),
        }));
      },

      nextSession(delta: number) {
        const n = get().sessions.length;
        const limit = (x: number) => (x + n) % n;
        const i = get().currentSessionIndex;
        get().selectSession(limit(i + delta));
      },

      deleteSession(index: number) {
        const deletingLastSession = get().sessions.length === 1;
        const deletedSession = get().sessions.at(index);

        if (!deletedSession) return;

        const sessions = get().sessions.slice();
        sessions.splice(index, 1);

        const currentIndex = get().currentSessionIndex;
        let nextIndex = Math.min(
          currentIndex - Number(index < currentIndex),
          sessions.length - 1,
        );

        if (deletingLastSession) {
          nextIndex = 0;
          sessions.push(createEmptySession());
        }

        // for undo delete action
        const restoreState = {
          currentSessionIndex: get().currentSessionIndex,
          sessions: get().sessions.slice(),
        };

        set(() => ({
          currentSessionIndex: nextIndex,
          sessions,
        }));

        showToast(
          Locale.Home.DeleteToast,
          {
            text: Locale.Home.Revert,
            onClick() {
              set(() => restoreState);
            },
          },
          5000,
        );
      },

      currentSession() {
        let index = get().currentSessionIndex;
        const sessions = get().sessions;

        if (index < 0 || index >= sessions.length) {
          index = Math.min(sessions.length - 1, Math.max(0, index));
          set(() => ({ currentSessionIndex: index }));
        }

        const session = sessions[index];

        return session;
      },

      onNewMessage(message: ChatMessage, targetSession: ChatSession) {
        get().updateTargetSession(targetSession, (session) => {
          session.messages = session.messages.concat();
          session.lastUpdate = Date.now();
        });

        get().updateStat(message, targetSession);

        get().checkMcpJson(message);

        get().summarizeSession(false, targetSession);
      },

      async onUserInput(
        content: string,
        attachImages?: string[],
        isMcpResponse?: boolean,
        pythonSimulation = false,
      ) {
        assertSafePrompt(content);
        const owner = currentIdentity();
        const session = get().currentSession();
        const modelConfig = session.mask.modelConfig;
        const sendSimulation = pythonSimulation
          ? (await import("../client/python-chat")).requestPythonChat
          : undefined;
        const { retrieveReferences, referenceContext } = await import(
          "../utils/local-rag"
        );
        const sources =
          owner === "locked"
            ? []
            : await retrieveReferences(session.id, content);
        if (
          owner !== currentIdentity() ||
          get().currentSession().id !== session.id
        )
          throw new Error("身份已切换，请重新发送。");

        // MCP Response no need to fill template
        let mContent: string | MultimodalContent[] = isMcpResponse
          ? content
          : fillTemplateWith(content, modelConfig);

        if (!isMcpResponse && attachImages && attachImages.length > 0) {
          mContent = [
            ...(mContent ? [{ type: "text" as const, text: mContent }] : []),
            ...attachImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ];
        }

        let userMessage: ChatMessage = createMessage({
          role: "user",
          content: mContent,
          isMcpResponse,
        });

        const botMessage: ChatMessage = createMessage({
          role: "assistant",
          streaming: true,
          model: modelConfig.model,
          sources,
          reasoningEffort: useWorkspacePreferences.getState().effort,
        });

        // get recent messages
        const systemSupplement =
          !pythonSimulation && !isMcpResponse && !isDalle3(modelConfig.model)
            ? ENGINEERING_PLOT_PROMPT
            : "";
        let recentMessages = await get().getMessagesWithMemory(
          session,
          systemSupplement,
        );
        if (
          owner !== currentIdentity() ||
          get().currentSession().id !== session.id
        )
          throw new Error("身份已切换，请重新发送。");
        const specialist = workflowInstruction(session.workflowId),
          rag = referenceContext(sources);
        let gauge = tokenGauge(
          estimateContext(recentMessages, userMessage, specialist, rag).total,
          contextWindow(session.contextWindow),
        );
        if (session.autoCompact && gauge.shouldCompact) {
          let canCompact = false;
          try {
            compactionPlan(session);
            canCompact = true;
          } catch {
            /* no older complete turns */
          }
          if (canCompact) {
            const { semanticCompaction } = await import(
              "../utils/context-runtime"
            );
            await semanticCompaction(session.id, true);
            recentMessages = await get().getMessagesWithMemory(
              session,
              systemSupplement,
            );
            gauge = tokenGauge(
              estimateContext(recentMessages, userMessage, specialist, rag)
                .total,
              contextWindow(session.contextWindow),
            );
          }
        }
        if (
          owner !== currentIdentity() ||
          get().currentSession().id !== session.id
        )
          throw new Error("会话已切换，请重新发送。");
        const { messages: sendMessages, removed } = fitChatHistory(
          composeRequest(recentMessages, userMessage, specialist, rag),
        );
        if (removed) {
          botMessage.omittedHistoryTurns = removed;
          gauge = tokenGauge(
            estimateContext(sendMessages.slice(0, -1), userMessage).total,
            contextWindow(session.contextWindow),
          );
        }
        if (gauge.exceeded)
          throw new Error(
            `估算上下文为 ${gauge.total.toLocaleString(
              "zh-CN",
            )} token，当前窗口上限为 ${gauge.limit.toLocaleString(
              "zh-CN",
            )} token。请先浓缩历史、移除附件或新建会话。草稿与附件已保留。`,
          );
        const messageIndex = session.messages.length + 1;

        // save user's and bot's message
        get().updateTargetSession(session, (session) => {
          const savedUserMessage = {
            ...userMessage,
            content: mContent,
          };
          session.messages = session.messages.concat([
            savedUserMessage,
            botMessage,
          ]);
        });

        let requestController: AbortController | undefined;
        const submittedAt = Date.now();
        const chatOptions: ChatOptions = {
          messages: sendMessages,
          config: {
            ...modelConfig,
            stream: true,
            webSearch: session.webSearch === true,
            reasoningEffort: botMessage.reasoningEffort,
          },
          onEffort(effort, fallback) {
            if (owner !== currentIdentity()) return;
            botMessage.reasoningEffort = effort;
            botMessage.reasoningFallback = fallback;
          },
          onSources(sources) {
            if (owner !== currentIdentity()) return;
            botMessage.webSources = sources;
            get().updateTargetSession(session, (s) => {
              s.messages = s.messages.concat();
            });
          },
          onSearchNotice(notice) {
            if (owner !== currentIdentity()) return;
            botMessage.searchNotice = notice;
            get().updateTargetSession(session, (s) => {
              s.messages = s.messages.concat();
            });
          },
          onUpdate(message) {
            if (owner !== currentIdentity()) return;
            botMessage.streaming = true;
            if (message) {
              botMessage.content = message;
              const reasoning = splitReasoning(message);
              if (reasoning.reasoning && !botMessage.reasoningStartedAt)
                botMessage.reasoningStartedAt = submittedAt;
              if (
                !reasoning.thinking &&
                botMessage.reasoningStartedAt &&
                botMessage.reasoningDurationMs === undefined
              )
                botMessage.reasoningDurationMs =
                  Date.now() - botMessage.reasoningStartedAt;
            }
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          async onFinish(message) {
            if (owner !== currentIdentity()) return;
            botMessage.streaming = false;
            if (
              botMessage.reasoningStartedAt &&
              botMessage.reasoningDurationMs === undefined
            )
              botMessage.reasoningDurationMs =
                Date.now() - botMessage.reasoningStartedAt;
            if (message) {
              botMessage.content = message;
              botMessage.date = new Date().toLocaleString();
              get().onNewMessage(botMessage, session);
            }
            ChatControllerPool.remove(session.id, botMessage.id);
          },
          onBeforeTool(tool: ChatMessageTool) {
            (botMessage.tools = botMessage?.tools || []).push(tool);
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          onAfterTool(tool: ChatMessageTool) {
            botMessage?.tools?.forEach((t, i, tools) => {
              if (tool.id == t.id) {
                tools[i] = { ...tool };
              }
            });
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
          },
          onError(error) {
            if (owner !== currentIdentity()) return;
            const isAborted = requestController?.signal.aborted;
            const interrupted =
              !isAborted &&
              (error.message === CHAT_INTERRUPTED_MESSAGE ||
                isChatNetworkInterruption(error));
            const gatewayTimeout =
              error.message === GATEWAY_TIMEOUT_MESSAGE ||
              isGatewayTimeout(undefined, error.message);
            if (!isAborted) {
              botMessage.content +=
                "\n\n" +
                (gatewayTimeout
                  ? GATEWAY_TIMEOUT_MESSAGE
                  : interrupted
                  ? CHAT_INTERRUPTED_MESSAGE
                  : pythonSimulation
                  ? error.message
                  : prettyObject({ error: true, message: error.message }));
            }
            botMessage.streaming = false;
            userMessage.isError = !isAborted;
            botMessage.isError = !isAborted;
            get().updateTargetSession(session, (session) => {
              session.messages = session.messages.concat();
            });
            ChatControllerPool.remove(
              session.id,
              botMessage.id ?? messageIndex,
            );

            console.error("[Chat] failed ", error);
          },
          onController(controller) {
            requestController = controller;
            // collect controller for stop/retry
            ChatControllerPool.addController(
              session.id,
              botMessage.id ?? messageIndex,
              controller,
            );
          },
        };
        if (sendSimulation) {
          void sendSimulation(chatOptions);
        } else {
          const api: ClientApi = getClientApi(modelConfig.providerName);
          api.llm.chat(chatOptions);
        }
      },

      getMemoryPrompt() {
        const session = get().currentSession();

        if (session.memoryPrompt.length) {
          return {
            role: "system",
            content: Locale.Store.Prompt.History(session.memoryPrompt),
            date: "",
          } as ChatMessage;
        }
      },

      async getMessagesWithMemory(target?: ChatSession, systemSupplement = "") {
        const session = target || get().currentSession();
        const modelConfig = session.mask.modelConfig;
        const clearContextIndex = session.clearContextIndex ?? 0;
        const messages = session.messages.slice();
        const totalMessageCount = session.messages.length;

        // in-context prompts
        const contextPrompts = session.mask.context.slice();

        // system prompts, to get close to OpenAI Web ChatGPT
        const shouldInjectSystemPrompts =
          modelConfig.enableInjectSystemPrompts &&
          (session.mask.modelConfig.model.startsWith("gpt-") ||
            session.mask.modelConfig.model.startsWith("chatgpt-"));

        const mcpEnabled = false;
        const mcpSystemPrompt = mcpEnabled
          ? await getMcpSystemPrompt(useAccessStore.getState().accessCode)
          : "";

        var systemPrompts: ChatMessage[] = [];

        if (shouldInjectSystemPrompts) {
          systemPrompts = [
            createMessage({
              role: "system",
              content:
                fillTemplateWith("", {
                  ...modelConfig,
                  template: DEFAULT_SYSTEM_TEMPLATE,
                }) + mcpSystemPrompt,
            }),
          ];
        } else if (mcpEnabled) {
          systemPrompts = [
            createMessage({
              role: "system",
              content: mcpSystemPrompt,
            }),
          ];
        }

        if (systemSupplement) {
          const existing = systemPrompts[0];
          if (existing) {
            existing.content = existing.content + "\n\n" + systemSupplement;
          } else {
            systemPrompts = [
              createMessage({ role: "system", content: systemSupplement }),
            ];
          }
        }

        if (shouldInjectSystemPrompts || mcpEnabled) {
          console.log(
            "[Global System Prompt] ",
            systemPrompts.at(0)?.content ?? "empty",
          );
        }
        const compacted = activeSummary(session);
        const memoryText =
          compacted?.summary.text ||
          (clearContextIndex === 0 ? session.memoryPrompt : "");
        const start = compacted ? compacted.through + 1 : clearContextIndex;
        const recentMessages = [
          ...systemPrompts,
          ...(memoryText
            ? [
                createMessage({
                  role: "system",
                  content: Locale.Store.Prompt.History(memoryText),
                }),
              ]
            : []),
          ...contextPrompts,
          ...messages.slice(start).filter((m) => !m.isError),
        ];

        return recentMessages;
      },

      updateMessage(
        sessionIndex: number,
        messageIndex: number,
        updater: (message?: ChatMessage) => void,
      ) {
        const sessions = get().sessions;
        const session = sessions.at(sessionIndex);
        const messages = session?.messages;
        updater(messages?.at(messageIndex));
        set(() => ({ sessions }));
      },

      resetSession(session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.messages = [];
          session.memoryPrompt = "";
        });
      },

      summarizeSession(
        refreshTitle: boolean = false,
        targetSession: ChatSession,
      ) {
        const owner = currentIdentity();
        const config = useAppConfig.getState();
        const session = targetSession;
        const modelConfig = session.mask.modelConfig;
        // skip summarize when using dalle3?
        if (isDalle3(modelConfig.model)) {
          return;
        }

        // if not config compressModel, then using getSummarizeModel
        const [model, providerName] = modelConfig.compressModel
          ? [modelConfig.compressModel, modelConfig.compressProviderName]
          : getSummarizeModel(
              session.mask.modelConfig.model,
              session.mask.modelConfig.providerName,
            );
        const api: ClientApi = getClientApi(providerName as ServiceProvider);

        // remove error messages if any
        const messages = session.messages;

        // should summarize topic after chating more than 50 words
        const SUMMARIZE_MIN_LEN = 50;
        if (
          (config.enableAutoGenerateTitle &&
            session.topic === DEFAULT_TOPIC &&
            countMessages(messages) >= SUMMARIZE_MIN_LEN) ||
          refreshTitle
        ) {
          const startIndex = Math.max(
            0,
            messages.length - modelConfig.historyMessageCount,
          );
          const topicMessages = messages
            .slice(
              startIndex < messages.length ? startIndex : messages.length - 1,
              messages.length,
            )
            .concat(
              createMessage({
                role: "user",
                content: Locale.Store.Prompt.Topic,
              }),
            );
          api.llm.chat({
            messages: topicMessages,
            config: {
              model,
              stream: false,
              providerName,
            },
            onFinish(message, responseRes) {
              if (owner !== currentIdentity()) return;
              if (responseRes?.status === 200) {
                get().updateTargetSession(
                  session,
                  (session) =>
                    (session.topic =
                      message.length > 0 ? trimTopic(message) : DEFAULT_TOPIC),
                );
              }
            },
          });
        }
        // History compression is explicit, or opt-in at 75% before sending.
        // The legacy hidden 1k-token summarizer is superseded by semanticCompaction.
      },

      updateStat(message: ChatMessage, session: ChatSession) {
        get().updateTargetSession(session, (session) => {
          session.stat.charCount += message.content.length;
          // TODO: should update chat count and word count
        });
      },
      updateTargetSession(
        targetSession: ChatSession,
        updater: (session: ChatSession) => void,
      ) {
        const sessions = get().sessions;
        const index = sessions.findIndex((s) => s.id === targetSession.id);
        if (index < 0) return;
        updater(sessions[index]);
        set(() => ({ sessions }));
      },
      async clearAllData() {
        const { clearIdentityData } = await import("../utils/identity-data");
        await clearIdentityData();
        useAccessStore.getState().clearIdentity();
        location.reload();
      },
      setLastInput(lastInput: string) {
        set({
          lastInput,
        });
      },

      // The shared Serverless app never executes tools from model output.
      checkMcpJson(_message: ChatMessage) {},
    };

    return methods;
  },
  {
    name: StoreKey.Chat,
    version: 3.3,
    merge(persistedState, state) {
      const merged = { ...state, ...(persistedState as Partial<typeof state>) };
      try {
        const activeId = window.localStorage.getItem(
          identityStorageKey(SESSION_INDEX_KEY),
        );
        const index = merged.sessions.findIndex(
          (session) => session.id === activeId,
        );
        if (index >= 0) merged.currentSessionIndex = index;
      } catch {
        // Older saves retain the selected index in the database.
      }
      return merged;
    },
    migrate(persistedState, version) {
      const state = persistedState as any;
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_CHAT_STATE;

      if (version < 2) {
        newState.sessions = [];

        const oldSessions = state.sessions;
        for (const oldSession of oldSessions) {
          const newSession = createEmptySession();
          newSession.topic = oldSession.topic;
          newSession.messages = [...oldSession.messages];
          newSession.mask.modelConfig.sendMemory = true;
          newSession.mask.modelConfig.historyMessageCount = 4;
          newSession.mask.modelConfig.compressMessageLengthThreshold = 1000;
          newState.sessions.push(newSession);
        }
      }

      if (version < 3) {
        // migrate id to nanoid
        newState.sessions.forEach((s) => {
          s.id = nanoid();
          s.messages.forEach((m) => (m.id = nanoid()));
        });
      }

      // Enable `enableInjectSystemPrompts` attribute for old sessions.
      // Resolve issue of old sessions not automatically enabling.
      if (version < 3.1) {
        newState.sessions.forEach((s) => {
          if (
            // Exclude those already set by user
            !s.mask.modelConfig.hasOwnProperty("enableInjectSystemPrompts")
          ) {
            // Because users may have changed this configuration,
            // the user's current configuration is used instead of the default
            const config = useAppConfig.getState();
            s.mask.modelConfig.enableInjectSystemPrompts =
              config.modelConfig.enableInjectSystemPrompts;
          }
        });
      }

      // add default summarize model for every session
      if (version < 3.2) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = config.modelConfig.compressModel;
          s.mask.modelConfig.compressProviderName =
            config.modelConfig.compressProviderName;
        });
      }
      // revert default summarize model for every session
      if (version < 3.3) {
        newState.sessions.forEach((s) => {
          const config = useAppConfig.getState();
          s.mask.modelConfig.compressModel = "";
          s.mask.modelConfig.compressProviderName = "";
        });
      }

      return newState as any;
    },
  },
);

useChatStore.subscribe((state, previous) => {
  if (
    !state._hasHydrated ||
    identityChanging() ||
    currentIdentity() === "locked"
  )
    return;
  const active = state.sessions[state.currentSessionIndex]?.id;
  if (!active || active === previous.sessions[previous.currentSessionIndex]?.id)
    return;
  try {
    window.localStorage.setItem(identityStorageKey(SESSION_INDEX_KEY), active);
  } catch (error) {
    reportStorageError(error);
  }
});
