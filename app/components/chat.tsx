import { ContextMeter } from "./context-meter";
import juniorStyles from "./junior.module.scss";
import { lazyModal } from "./lazy-modal";
import { splitReasoning, isReasoningModel } from "../utils/reasoning";
import { useDebouncedCallback } from "use-debounce";
import React, {
  Fragment,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import SendWhiteIcon from "../icons/send-white.svg";
import BrainIcon from "../icons/brain.svg";
import RenameIcon from "../icons/rename.svg";
import EditIcon from "../icons/rename.svg";
import ExportIcon from "../icons/share.svg";
import ReturnIcon from "../icons/return.svg";
import CopyIcon from "../icons/copy.svg";
import SpeakIcon from "../icons/speak.svg";
import SpeakStopIcon from "../icons/speak-stop.svg";
import LoadingIcon from "../icons/three-dots.svg";
import LoadingButtonIcon from "../icons/loading.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import ResetIcon from "../icons/reload.svg";
import ReloadIcon from "../icons/reload.svg";
import DeleteIcon from "../icons/clear.svg";
import PinIcon from "../icons/pin.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CloseIcon from "../icons/close.svg";
import CancelIcon from "../icons/cancel.svg";
import ImageIcon from "../icons/image.svg";

import BottomIcon from "../icons/bottom.svg";
import StopIcon from "../icons/pause.svg";
import RobotIcon from "../icons/robot.svg";
import {
  ChatMessage,
  createMessage,
  DEFAULT_TOPIC,
  SubmitKey,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";

import {
  autoGrowTextArea,
  copyToClipboard,
  getMessageImages,
  getMessageTextContent,
  isVisionModel,
  safeLocalStorage,
  useMobileScreen,
  selectOrCopy,
} from "../utils";

import {
  AttachmentImportDialog,
  AttachmentImportChoice,
} from "./attachment-import-dialog";
import { WelcomeCard } from "./welcome-card";
import { useCampusUI } from "../store/campus";
import { useFinale } from "../store/finale";
import { useCapstone } from "../store/capstone";
import { matchSlash } from "../utils/slash-commands";
import finaleStyles from "./finale.module.scss";
import {
  ATTACHMENT_ACCEPT,
  MAX_DOCUMENTS,
  MAX_FILES,
  MAX_IMAGES,
  AttachmentFileSizeError,
  AttachmentTextLimitError,
  DocumentAttachment,
  PdfPageRange,
  TextAttachment,
  attachmentKind,
  readDocumentAttachment,
  messageWithAttachments,
  pdfPageLabel,
  validateAttachmentText,
} from "../utils/attachments";
import {
  AttachmentBudget,
  attachmentBudget,
  attachmentCharacterCount,
  attachmentCharacters,
  attachmentLimitLabel,
  attachmentOverflowLabel,
  attachmentPrefixPercent,
  fileSizeLabel,
  numberLabel,
} from "../utils/attachment-policy";
import { prepareImageAttachment } from "../utils/image-attachment";

import dynamic from "next/dynamic";

import { ChatControllerPool } from "../client/controller";
import { Prompt, usePromptStore } from "../store/prompt";
import Locale from "../locales";

import { IconButton } from "./button";
import styles from "./chat.module.scss";

import {
  List,
  ListItem,
  Modal,
  Selector,
  Toast,
  showConfirm,
  showPrompt,
  showToast,
} from "./ui-lib";
import { useNavigate } from "react-router-dom";
import {
  CHAT_PAGE_SIZE,
  DEFAULT_TTS_ENGINE,
  ModelProvider,
  Path,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
  UNFINISHED_INPUT,
} from "../constant";
import { Avatar } from "./emoji";
import { ContextPrompts, MaskAvatar, MaskConfig } from "./mask";
import { useMaskStore } from "../store/mask";
import { ChatCommandPrefix, useChatCommand, useCommand } from "../command";
import { prettyObject } from "../utils/format";
import { ExportMessageModal } from "./exporter";
import { getClientConfig } from "../config/client";
import { useAllModels } from "../utils/hooks";
import { ClientApi, MultimodalContent } from "../client/api";
import { createTTSPlayer } from "../utils/audio";
import { MsEdgeTTS, OUTPUT_FORMAT } from "../utils/ms_edge_tts";

import { RealtimeChat } from "@/app/components/realtime-chat";
import clsx from "clsx";
import campusStyles from "./campus.module.scss";
import { assertSafePrompt } from "../utils/security-guard";
import { currentIdentity, identityStorageKey } from "../utils/identity-storage";
import { isAudioFile, AUDIO_ACCEPT } from "../utils/audio-transcription";
import { WORKFLOWS, WORKSPACE_QUOTES } from "../config/workflow-templates";
const ReferenceLibrary = lazyModal(
  () => import("./reference-library"),
  "本会话资料库",
);
const AudioTranscriber = lazyModal(
  () => import("./audio-transcriber"),
  "音频转文字",
);
const ImageAnnotator = lazyModal(
  () => import("./image-annotator"),
  "图片精修画布",
);
const ImageComparison = dynamic(() => import("./image-comparison"), {
  ssr: false,
});
const AssistantExports = dynamic(() => import("./assistant-exports"), {
  ssr: false,
});
const SourceCitations = dynamic(() => import("./source-citations"), {
  ssr: false,
});

const localStorage = safeLocalStorage();

const ttsPlayer = createTTSPlayer();

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

export function SessionConfigModel(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const maskStore = useMaskStore();
  const navigate = useNavigate();

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Context.Edit}
        onClose={() => props.onClose()}
        actions={[
          <IconButton
            key="reset"
            icon={<ResetIcon />}
            bordered
            text={Locale.Chat.Config.Reset}
            onClick={async () => {
              if (await showConfirm(Locale.Memory.ResetConfirm)) {
                chatStore.updateTargetSession(
                  session,
                  (session) => (session.memoryPrompt = ""),
                );
              }
            }}
          />,
          <IconButton
            key="copy"
            icon={<CopyIcon />}
            bordered
            text={Locale.Chat.Config.SaveAs}
            onClick={() => {
              navigate(Path.Masks);
              setTimeout(() => {
                maskStore.create(session.mask);
              }, 500);
            }}
          />,
        ]}
      >
        <MaskConfig
          mask={session.mask}
          updateMask={(updater) => {
            const mask = { ...session.mask };
            updater(mask);
            chatStore.updateTargetSession(
              session,
              (session) => (session.mask = mask),
            );
          }}
          shouldSyncFromGlobal
          extraListItems={
            session.mask.modelConfig.sendMemory ? (
              <ListItem
                className="copyable"
                title={`${Locale.Memory.Title} (${session.lastSummarizeIndex} of ${session.messages.length})`}
                subTitle={session.memoryPrompt || Locale.Memory.EmptyContent}
              ></ListItem>
            ) : (
              <></>
            )
          }
        ></MaskConfig>
      </Modal>
    </div>
  );
}

function PromptToast(props: {
  showToast?: boolean;
  showModal?: boolean;
  setShowModal: (_: boolean) => void;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const context = session.mask.context;

  return (
    <div className={styles["prompt-toast"]} key="prompt-toast">
      {props.showToast && context.length > 0 && (
        <div
          className={clsx(styles["prompt-toast-inner"], "clickable")}
          role="button"
          onClick={() => props.setShowModal(true)}
        >
          <BrainIcon />
          <span className={styles["prompt-toast-content"]}>
            {Locale.Context.Toast(context.length)}
          </span>
        </div>
      )}
      {props.showModal && (
        <SessionConfigModel onClose={() => props.setShowModal(false)} />
      )}
    </div>
  );
}

function useSubmitHandler() {
  const config = useAppConfig();
  const submitKey = config.submitKey;
  const isComposing = useRef(false);

  useEffect(() => {
    const onCompositionStart = () => {
      isComposing.current = true;
    };
    const onCompositionEnd = () => {
      isComposing.current = false;
    };

    window.addEventListener("compositionstart", onCompositionStart);
    window.addEventListener("compositionend", onCompositionEnd);

    return () => {
      window.removeEventListener("compositionstart", onCompositionStart);
      window.removeEventListener("compositionend", onCompositionEnd);
    };
  }, []);

  const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Fix Chinese input method "Enter" on Safari
    if (e.keyCode == 229) return false;
    if (e.key !== "Enter") return false;
    if (e.key === "Enter" && (e.nativeEvent.isComposing || isComposing.current))
      return false;
    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.MetaEnter && e.metaKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

export type RenderPrompt = Pick<Prompt, "title" | "content">;

export function PromptHints(props: {
  prompts: RenderPrompt[];
  onPromptSelect: (prompt: RenderPrompt) => void;
}) {
  const noPrompts = props.prompts.length === 0;
  const [selectIndex, setSelectIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectIndex(0);
  }, [props.prompts.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (noPrompts || e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }
      // arrow up / down to select prompt
      const changeIndex = (delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        const nextIndex = Math.max(
          0,
          Math.min(props.prompts.length - 1, selectIndex + delta),
        );
        setSelectIndex(nextIndex);
        selectedRef.current?.scrollIntoView({
          block: "center",
        });
      };

      if (e.key === "ArrowUp") {
        changeIndex(1);
      } else if (e.key === "ArrowDown") {
        changeIndex(-1);
      } else if (e.key === "Enter") {
        const selectedPrompt = props.prompts.at(selectIndex);
        if (selectedPrompt) {
          props.onPromptSelect(selectedPrompt);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prompts.length, selectIndex]);

  if (noPrompts) return null;
  return (
    <div className={styles["prompt-hints"]}>
      {props.prompts.map((prompt, i) => (
        <div
          ref={i === selectIndex ? selectedRef : null}
          className={clsx(styles["prompt-hint"], {
            [styles["prompt-hint-selected"]]: i === selectIndex,
          })}
          key={prompt.title + i.toString()}
          onClick={() => props.onPromptSelect(prompt)}
          onMouseEnter={() => setSelectIndex(i)}
        >
          <div className={styles["hint-title"]}>{prompt.title}</div>
          <div className={styles["hint-content"]}>{prompt.content}</div>
        </div>
      ))}
    </div>
  );
}

function ClearContextDivider() {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();

  return (
    <div
      className={styles["clear-context"]}
      onClick={() =>
        chatStore.updateTargetSession(
          session,
          (session) => (session.clearContextIndex = undefined),
        )
      }
    >
      <div className={styles["clear-context-tips"]}>{Locale.Context.Clear}</div>
      <div className={styles["clear-context-revert-btn"]}>
        {Locale.Context.Revert}
      </div>
    </div>
  );
}

export function ChatAction(props: {
  text: string;
  icon: JSX.Element;
  onClick: () => void;
}) {
  const iconRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState({
    full: 16,
    icon: 16,
  });

  function updateWidth() {
    if (!iconRef.current || !textRef.current) return;
    const getWidth = (dom: HTMLDivElement) => dom.getBoundingClientRect().width;
    const textWidth = getWidth(textRef.current);
    const iconWidth = getWidth(iconRef.current);
    setWidth({
      full: textWidth + iconWidth,
      icon: iconWidth,
    });
  }

  return (
    <div
      className={clsx(styles["chat-input-action"], "clickable")}
      onClick={() => {
        props.onClick();
        setTimeout(updateWidth, 1);
      }}
      onMouseEnter={updateWidth}
      onTouchStart={updateWidth}
      style={
        {
          "--icon-width": `${width.icon}px`,
          "--full-width": `${width.full}px`,
        } as React.CSSProperties
      }
    >
      <div ref={iconRef} className={styles["icon"]}>
        {props.icon}
      </div>
      <div className={styles["text"]} ref={textRef}>
        {props.text}
      </div>
    </div>
  );
}

function useScrollToBottom(
  scrollRef: RefObject<HTMLDivElement>,
  detach: boolean = false,
  messages: ChatMessage[],
) {
  // for auto-scroll
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollDomToBottom = useCallback(() => {
    if (!messages.length) return;
    const dom = scrollRef.current;
    if (dom) {
      requestAnimationFrame(() => {
        setAutoScroll(true);
        dom.scrollTo(0, dom.scrollHeight);
      });
    }
  }, [scrollRef, messages.length]);

  // auto scroll
  useEffect(() => {
    if (autoScroll && !detach) {
      scrollDomToBottom();
    }
  });

  // auto scroll when messages length changes
  const lastMessagesLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > lastMessagesLength.current && !detach) {
      scrollDomToBottom();
    }
    lastMessagesLength.current = messages.length;
  }, [messages.length, detach, scrollDomToBottom]);

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
    scrollDomToBottom,
  };
}

export function ChatActions(props: {
  uploadImage: () => void;
  captureImage: (file: File) => void;
  setAttachImages: (images: string[]) => void;
  setUploading: (uploading: boolean) => void;
  showPromptModal: () => void;
  scrollToBottom: () => void;
  showPromptHints: () => void;
  hitBottom: boolean;
  uploading: boolean;
  setShowShortcutKeyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setUserInput: (input: string) => void;
  setShowChatSidePanel: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const allModels = useAllModels();
  const models = useMemo(
    () =>
      allModels.filter(
        (model) =>
          model.available &&
          model.provider?.providerName === ServiceProvider.OpenAI,
      ),
    [allModels],
  );
  const currentModel = session.mask.modelConfig.model;
  const mobile = useMobileScreen();
  const cameraInput = useRef<HTMLInputElement>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);

  return (
    <div className={styles["chat-input-actions"]}>
      <IconButton
        icon={props.uploading ? <LoadingButtonIcon /> : <ImageIcon />}
        text={props.uploading ? "正在读取…" : mobile ? "文件" : "添加文件"}
        aria="添加图片、PDF、Word 或文本文件"
        title={`图片、PDF、Word、PPTX、Excel、文本及代码；文档最多 100 MB。${attachmentLimitLabel(
          attachmentBudget(currentModel, session.contextWindow),
        )}`}
        onClick={props.uploadImage}
        disabled={props.uploading}
      />
      {mobile && (
        <>
          <input
            hidden
            ref={cameraInput}
            aria-label="拍照识题相机"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) props.captureImage(file);
            }}
          />
          <IconButton
            icon={<span aria-hidden="true">⌾</span>}
            text="拍照识题"
            aria="拍照识题"
            disabled={props.uploading}
            onClick={() => cameraInput.current?.click()}
          />
        </>
      )}
      <IconButton
        icon={<RobotIcon />}
        text={
          (mobile && /^gpt-\d+(?:\.\d+)?-sol$/i.test(currentModel)
            ? currentModel.replace(/^gpt-(\d+(?:\.\d+)?)-sol$/i, "$1 Sol")
            : models.find((m) => m.name === currentModel)?.displayName) ||
          currentModel
        }
        aria="切换模型"
        onClick={() => setShowModelSelector(true)}
      />
      {isReasoningModel(currentModel) && <ReasoningEffortControl />}
      {ChatControllerPool.hasPending() && (
        <IconButton
          icon={<StopIcon />}
          text="停止生成"
          onClick={() => ChatControllerPool.stopAll()}
        />
      )}
      {!props.hitBottom && (
        <IconButton
          icon={<BottomIcon />}
          text="回到底部"
          onClick={props.scrollToBottom}
        />
      )}
      {showModelSelector && (
        <Selector
          title="切换模型"
          defaultSelectedValue={currentModel}
          items={models.map((m) => ({
            title: m.displayName || m.name,
            value: m.name,
          }))}
          onClose={() => setShowModelSelector(false)}
          onSelection={(selected) => {
            if (!selected.length) return;
            chatStore.updateTargetSession(session, (target) => {
              target.mask.modelConfig.model = selected[0];
              target.mask.modelConfig.providerName = ServiceProvider.OpenAI;
              target.mask.syncGlobalConfig = false;
            });
          }}
        />
      )}
    </div>
  );
}

export function EditMessageModal(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [messages, setMessages] = useState(session.messages.slice());

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.EditMessage.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            text={Locale.UI.Cancel}
            icon={<CancelIcon />}
            key="cancel"
            onClick={() => {
              props.onClose();
            }}
          />,
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              chatStore.updateTargetSession(
                session,
                (session) => (session.messages = messages),
              );
              props.onClose();
            }}
          />,
        ]}
      >
        <List>
          <ListItem
            title={Locale.Chat.EditMessage.Topic.Title}
            subTitle={Locale.Chat.EditMessage.Topic.SubTitle}
          >
            <input
              type="text"
              value={session.topic}
              onInput={(e) =>
                chatStore.updateTargetSession(
                  session,
                  (session) => (session.topic = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>
        </List>
        <ContextPrompts
          context={messages}
          updateContext={(updater) => {
            const newMessages = messages.slice();
            updater(newMessages);
            setMessages(newMessages);
          }}
        />
      </Modal>
    </div>
  );
}

export function DeleteImageButton(props: {
  deleteImage: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={props.label ?? "移除图片"}
      title={props.label ?? "移除图片"}
      disabled={props.disabled}
      className={styles["delete-image"]}
      onClick={props.deleteImage}
    >
      <DeleteIcon />
    </button>
  );
}

export function ShortcutKeyModal(props: { onClose: () => void }) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcuts = [
    {
      title: Locale.Chat.ShortcutKey.newChat,
      keys: isMac ? ["⌘", "Shift", "O"] : ["Ctrl", "Shift", "O"],
    },
    { title: Locale.Chat.ShortcutKey.focusInput, keys: ["Shift", "Esc"] },
    {
      title: Locale.Chat.ShortcutKey.copyLastCode,
      keys: isMac ? ["⌘", "Shift", ";"] : ["Ctrl", "Shift", ";"],
    },
    {
      title: Locale.Chat.ShortcutKey.copyLastMessage,
      keys: isMac ? ["⌘", "Shift", "C"] : ["Ctrl", "Shift", "C"],
    },
    {
      title: Locale.Chat.ShortcutKey.showShortcutKey,
      keys: isMac ? ["⌘", "/"] : ["Ctrl", "/"],
    },
    {
      title: Locale.Chat.ShortcutKey.clearContext,
      keys: isMac
        ? ["⌘", "Shift", "backspace"]
        : ["Ctrl", "Shift", "backspace"],
    },
  ];
  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.ShortcutKey.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              props.onClose();
            }}
          />,
        ]}
      >
        <div className={styles["shortcut-key-container"]}>
          <div className={styles["shortcut-key-grid"]}>
            {shortcuts.map((shortcut, index) => (
              <div key={index} className={styles["shortcut-key-item"]}>
                <div className={styles["shortcut-key-title"]}>
                  {shortcut.title}
                </div>
                <div className={styles["shortcut-key-keys"]}>
                  {shortcut.keys.map((key, i) => (
                    <div key={i} className={styles["shortcut-key"]}>
                      <span>{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

const ReasoningEffortControl = dynamic(() => import("./reasoning-effort"), {
  ssr: false,
});
const ReasoningCapsule = dynamic(() => import("./reasoning-capsule"), {
  ssr: false,
});
const SelectionActions = dynamic(() => import("./selection-actions"), {
  ssr: false,
});
const WorkspaceTheme = dynamic(() => import("./workspace-theme"), {
  ssr: false,
});
const MessageActions = dynamic(() => import("./message-actions"), {
  ssr: false,
});
const TocRail = dynamic(() => import("./toc-rail"), { ssr: false });
const ContextCompactor = lazyModal(
  () => import("./context-compactor"),
  "浓缩前文",
);
const VoiceDictation = dynamic(() => import("./voice-dictation"), {
  ssr: false,
});
const SlashAutocomplete = dynamic(
  async () => (await import("./prompt-macros")).SlashAutocomplete,
  { ssr: false },
);
const LocalEncoder = lazyModal(() => import("./local-encoder"), "本地编码工具");

function _Chat() {
  type RenderMessage = ChatMessage & { preview?: boolean };

  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [libraryOpen, setLibraryOpen] = useState(false),
    [audioOpen, setAudioOpen] = useState(false),
    [audioFile, setAudioFile] = useState<File>(),
    [editImage, setEditImage] = useState("");
  const pendingImageEdit = useCampusUI((state) => state.pendingImageEdit);
  useEffect(() => {
    setEditImage("");
  }, [session.id]);
  useEffect(() => {
    if (!pendingImageEdit) return;
    if (
      pendingImageEdit.owner === currentIdentity() &&
      pendingImageEdit.sessionId === session.id
    )
      setEditImage(pendingImageEdit.src);
    useCampusUI.getState().clearImageEdit();
  }, [pendingImageEdit, session.id]);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const originalImages = useRef(new Map<string, File>());
  const [editSelection, setEditSelection] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setQuoteIndex((i) => i + 1), 45000);
    return () => clearInterval(timer);
  }, []);
  const config = useAppConfig();
  const fontSize = config.fontSize;
  const fontFamily = config.fontFamily;

  const [showExport, setShowExport] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState("");
  const [encoderOpen, setEncoderOpen] = useState(false);
  const originals = useMemo(() => {
    let previous = "";
    const result = new Map<string, string>();
    for (const message of session.messages) {
      if (message.role === "user") previous = getMessageTextContent(message);
      else result.set(message.id, previous);
    }
    return result;
  }, [session.messages]);
  const pendingCommand = useCampusUI((state) => state.command);
  useEffect(() => {
    if (!pendingCommand) return;
    if (pendingCommand.owner === currentIdentity()) {
      if (pendingCommand.kind === "draft") {
        setUserInput(pendingCommand.text);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (pendingCommand.kind === "append") {
        setUserInput((input) => input + pendingCommand.text);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (pendingCommand.kind === "library") setLibraryOpen(true);
      if (pendingCommand.kind === "encoder") setEncoderOpen(true);
    }
    useCampusUI.getState().clearCommand();
  }, [pendingCommand]);
  const [isLoading, setIsLoading] = useState(false);
  const { submitKey, shouldSubmit } = useSubmitHandler();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrolledToBottom = scrollRef?.current
    ? Math.abs(
        scrollRef.current.scrollHeight -
          (scrollRef.current.scrollTop + scrollRef.current.clientHeight),
      ) <= 1
    : false;
  const isAttachWithTop = useMemo(() => {
    const lastMessage = scrollRef.current?.lastElementChild as HTMLElement;
    // if scrolllRef is not ready or no message, return false
    if (!scrollRef?.current || !lastMessage) return false;
    const topDistance =
      lastMessage!.getBoundingClientRect().top -
      scrollRef.current.getBoundingClientRect().top;
    // leave some space for user question
    return topDistance < 100;
  }, [scrollRef?.current?.scrollHeight]);

  const isTyping = userInput !== "";

  // if user is typing, should auto scroll to bottom
  // if user is not typing, should auto scroll to bottom only if already at bottom
  const { setAutoScroll, scrollDomToBottom } = useScrollToBottom(
    scrollRef,
    (isScrolledToBottom || isAttachWithTop) && !isTyping,
    session.messages,
  );
  const [hitBottom, setHitBottom] = useState(true);
  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();
  const [attachImages, setAttachImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState<TextAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachmentToast, setAttachmentToast] = useState("");
  const attachmentToastTimer = useRef<number>();
  const [importDialog, setImportDialog] = useState<{
    fileName: string;
    overflow: AttachmentTextLimitError;
    budget: AttachmentBudget;
    alreadyAttached: number;
  } | null>(null);
  // Keep page ownership separate from URL equality: two PDF pages can render identically.
  const imageSources = useRef<
    Array<{ documentId: string; page: number } | null>
  >([]);
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const uploadInProgress = useRef(false);
  const uploadController = useRef<AbortController | null>(null);
  const importChoice = useRef<
    ((choice: AttachmentImportChoice) => void) | null
  >(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadController.current?.abort();
      importChoice.current?.(null);
      importChoice.current = null;
      window.clearTimeout(attachmentToastTimer.current);
    };
  }, []);

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPrompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // auto grow input
  const [inputRows, setInputRows] = useState(2);
  const measure = useDebouncedCallback(
    () => {
      const rows = inputRef.current ? autoGrowTextArea(inputRef.current) : 1;
      const inputRows = Math.min(
        20,
        Math.max(2 + Number(!isMobileScreen), rows),
      );
      setInputRows(inputRows);
    },
    100,
    {
      leading: true,
      trailing: true,
    },
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(measure, [userInput]);

  // chat commands shortcuts
  const chatCommands = useChatCommand({
    new: () => chatStore.newSession(),
    newm: () => navigate(Path.NewChat),
    prev: () => chatStore.nextSession(-1),
    next: () => chatStore.nextSession(1),
    clear: () =>
      chatStore.updateTargetSession(
        session,
        (session) => (session.clearContextIndex = session.messages.length),
      ),
    fork: () => chatStore.forkSession(),
    del: () => chatStore.deleteSession(chatStore.currentSessionIndex),
  });

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    setUserInput(text);
    if (matchSlash(text, useFinale.getState().macros).length) {
      onSearch.cancel();
      setPromptHints([]);
      return;
    }
    const n = text.trim().length;

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (text.match(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  const preparing = useRef(false);
  function reportAttachmentError(message: string) {
    setAttachmentError(message);
    setAttachmentToast(message);
    window.clearTimeout(attachmentToastTimer.current);
    attachmentToastTimer.current = window.setTimeout(
      () => setAttachmentToast(""),
      6500,
    );
  }

  const doSubmit = (userInput: string) => {
    if (uploadInProgress.current || preparing.current) return;
    if (userInput.trim() === "" && !attachImages.length && !documents.length)
      return;
    if (attachImages.length && !isVisionModel(session.mask.modelConfig.model)) {
      reportAttachmentError(
        "当前模型不支持图片，请切换支持视觉的模型，或移除图片后发送。",
      );
      return;
    }
    const budget = attachmentBudget(
      session.mask.modelConfig.model,
      session.contextWindow,
    );
    const documentCharacters = attachmentCharacters(documents);
    if (documentCharacters > budget.limit) {
      reportAttachmentError(
        `${attachmentOverflowLabel(documentCharacters, budget)}请分次发送。`,
      );
      return;
    }
    const matchCommand = chatCommands.match(userInput);
    if (matchCommand.matched) {
      setUserInput("");
      setPromptHints([]);
      matchCommand.invoke();
      return;
    }
    try {
      assertSafePrompt(messageWithAttachments(userInput, documents));
    } catch (e) {
      setAttachmentError((e as Error).message);
      return;
    }
    setIsLoading(true);
    preparing.current = true;
    const sentOwner = currentIdentity(),
      sentSession = session.id;
    const savedImages = [...attachImages],
      savedDocuments = [...documents],
      savedSources = [...imageSources.current];
    chatStore
      .onUserInput(messageWithAttachments(userInput, documents), attachImages)
      .then(() => originalImages.current.clear())
      .catch((e) => {
        if (
          sentOwner !== currentIdentity() ||
          useChatStore.getState().currentSession().id !== sentSession
        )
          return;
        reportAttachmentError((e as Error).message);
        setUserInput(userInput);
        setAttachImages(savedImages);
        setDocuments(savedDocuments);
        imageSources.current = savedSources;
      })
      .finally(() => {
        preparing.current = false;
        setIsLoading(false);
      });
    setAttachImages([]);
    imageSources.current = [];
    setDocuments([]);
    setAttachmentError("");
    chatStore.setLastInput(userInput);
    setUserInput("");
    setPromptHints([]);
    if (!isMobileScreen) inputRef.current?.focus();
    setAutoScroll(true);
  };

  const onPromptSelect = (prompt: RenderPrompt) => {
    setTimeout(() => {
      setPromptHints([]);

      const matchedChatCommand = chatCommands.match(prompt.content);
      if (matchedChatCommand.matched) {
        // if user is selecting a chat command, just trigger it
        matchedChatCommand.invoke();
        setUserInput("");
      } else {
        // or fill the prompt
        setUserInput(prompt.content);
      }
      inputRef.current?.focus();
    }, 30);
  };

  // stop response
  const onUserStop = (messageId: string) => {
    ChatControllerPool.stop(session.id, messageId);
  };

  useEffect(() => {
    chatStore.updateTargetSession(session, (session) => {
      const stopTiming = Date.now() - REQUEST_TIMEOUT_MS;
      session.messages.forEach((m) => {
        // check if should stop all stale messages
        if (m.isError || new Date(m.date).getTime() < stopTiming) {
          if (m.streaming) {
            m.streaming = false;
          }

          if (m.content.length === 0) {
            m.isError = true;
            m.content = prettyObject({
              error: true,
              message: "empty response",
            });
          }
        }
      });

      // auto sync mask config from global config
      if (session.mask.syncGlobalConfig) {
        console.log("[Mask] syncing from global, name = ", session.mask.name);
        session.mask.modelConfig = { ...config.modelConfig };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // check if should send message
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // if ArrowUp and no userInput, fill with last input
    if (
      e.key === "ArrowUp" &&
      userInput.length <= 0 &&
      !(e.metaKey || e.altKey || e.ctrlKey)
    ) {
      setUserInput(chatStore.lastInput ?? "");
      e.preventDefault();
      return;
    }
    if (shouldSubmit(e) && promptHints.length === 0) {
      doSubmit(userInput);
      e.preventDefault();
    }
  };
  const onRightClick = (e: any, message: ChatMessage) => {
    // copy to clipboard
    if (selectOrCopy(e.currentTarget, getMessageTextContent(message))) {
      if (userInput.length === 0) {
        setUserInput(getMessageTextContent(message));
      }

      e.preventDefault();
    }
  };

  const deleteMessage = (msgId?: string) => {
    chatStore.updateTargetSession(
      session,
      (session) =>
        (session.messages = session.messages.filter((m) => m.id !== msgId)),
    );
  };

  const onDelete = (msgId: string) => {
    deleteMessage(msgId);
  };

  const onResend = (message: ChatMessage) => {
    // when it is resending a message
    // 1. for a user's message, find the next bot response
    // 2. for a bot's message, find the last user's input
    // 3. delete original user input and bot's message
    // 4. resend the user's input

    const resendingIndex = session.messages.findIndex(
      (m) => m.id === message.id,
    );

    if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
      console.error("[Chat] failed to find resending message", message);
      return;
    }

    let userMessage: ChatMessage | undefined;
    let botMessage: ChatMessage | undefined;

    if (message.role === "assistant") {
      // if it is resending a bot's message, find the user input for it
      botMessage = message;
      for (let i = resendingIndex; i >= 0; i -= 1) {
        if (session.messages[i].role === "user") {
          userMessage = session.messages[i];
          break;
        }
      }
    } else if (message.role === "user") {
      // if it is resending a user's input, find the bot's response
      userMessage = message;
      for (let i = resendingIndex; i < session.messages.length; i += 1) {
        if (session.messages[i].role === "assistant") {
          botMessage = session.messages[i];
          break;
        }
      }
    }

    if (userMessage === undefined) {
      console.error("[Chat] failed to resend", message);
      return;
    }

    // delete the original messages
    deleteMessage(userMessage.id);
    deleteMessage(botMessage?.id);

    // resend the message
    setIsLoading(true);
    const textContent = getMessageTextContent(userMessage);
    const images = getMessageImages(userMessage);
    chatStore.onUserInput(textContent, images).then(() => setIsLoading(false));
    inputRef.current?.focus();
  };

  const onPinMessage = (message: ChatMessage) => {
    chatStore.updateTargetSession(session, (session) =>
      session.mask.context.push(message),
    );

    showToast(Locale.Chat.Actions.PinToastContent, {
      text: Locale.Chat.Actions.PinToastAction,
      onClick: () => {
        setShowPromptModal(true);
      },
    });
  };

  const accessStore = useAccessStore();
  const [speechStatus, setSpeechStatus] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);

  async function openaiSpeech(text: string) {
    if (speechStatus) {
      ttsPlayer.stop();
      setSpeechStatus(false);
    } else {
      var api: ClientApi;
      api = new ClientApi(ModelProvider.GPT);
      const config = useAppConfig.getState();
      setSpeechLoading(true);
      ttsPlayer.init();
      let audioBuffer: ArrayBuffer;
      const { markdownToTxt } = require("markdown-to-txt");
      const textContent = markdownToTxt(text);
      if (config.ttsConfig.engine !== DEFAULT_TTS_ENGINE) {
        const edgeVoiceName = accessStore.edgeVoiceName();
        const tts = new MsEdgeTTS();
        await tts.setMetadata(
          edgeVoiceName,
          OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
        );
        audioBuffer = await tts.toArrayBuffer(textContent);
      } else {
        audioBuffer = await api.llm.speech({
          model: config.ttsConfig.model,
          input: textContent,
          voice: config.ttsConfig.voice,
          speed: config.ttsConfig.speed,
        });
      }
      setSpeechStatus(true);
      ttsPlayer
        .play(audioBuffer, () => {
          setSpeechStatus(false);
        })
        .catch((e) => {
          console.error("[OpenAI Speech]", e);
          showToast(prettyObject(e));
          setSpeechStatus(false);
        })
        .finally(() => setSpeechLoading(false));
    }
  }

  const context: RenderMessage[] = useMemo(() => {
    return session.mask.hideContext ? [] : session.mask.context.slice();
  }, [session.mask.context, session.mask.hideContext]);

  // preview messages
  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && config.sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [
    config.sendPreviewBubble,
    context,
    isLoading,
    session.messages,
    userInput,
  ]);

  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );
  const tocNavigationUntil = useRef(0);

  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }

  const messages = useMemo(() => {
    const endRenderIndex = Math.min(
      msgRenderIndex + 3 * CHAT_PAGE_SIZE,
      renderMessages.length,
    );
    return renderMessages.slice(msgRenderIndex, endRenderIndex);
  }, [msgRenderIndex, renderMessages]);

  const onChatBodyScroll = (e: HTMLElement) => {
    if (Date.now() < tocNavigationUntil.current) return;
    const bottomHeight = e.scrollTop + e.clientHeight;
    const edgeThreshold = e.clientHeight;

    const isTouchTopEdge = e.scrollTop <= edgeThreshold;
    const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
    const isHitBottom =
      bottomHeight >= e.scrollHeight - (isMobileScreen ? 4 : 10);

    const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
    const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

    if (isTouchTopEdge && !isTouchBottomEdge) {
      setMsgRenderIndex(prevPageMsgIndex);
    } else if (isTouchBottomEdge) {
      setMsgRenderIndex(nextPageMsgIndex);
    }

    setHitBottom(isHitBottom);
    setAutoScroll(isHitBottom);
  };

  function scrollToBottom() {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    scrollDomToBottom();
  }

  // clear context index = context length + index in messages
  const clearContextIndex =
    (session.clearContextIndex ?? -1) >= 0
      ? session.clearContextIndex! + context.length - msgRenderIndex
      : -1;

  const [showPromptModal, setShowPromptModal] = useState(false);

  const clientConfig = useMemo(() => getClientConfig(), []);

  const autoFocus = !isMobileScreen; // wont auto focus on mobile screen
  const showMaxIcon = !isMobileScreen && !clientConfig?.isApp;

  useCommand({
    fill: setUserInput,
    submit: (text) => {
      doSubmit(text);
    },
  });

  // edit / insert message modal
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // remember unfinished input
  useEffect(() => {
    // try to load from local storage
    const key = identityStorageKey(UNFINISHED_INPUT(session.id));
    const mayBeUnfinishedInput =
      session.initialPrompt || localStorage.getItem(key);
    if (session.initialPrompt)
      chatStore.updateTargetSession(session, (s) => {
        delete s.initialPrompt;
      });
    if (mayBeUnfinishedInput && userInput.length === 0) {
      setUserInput(mayBeUnfinishedInput);
      localStorage.removeItem(key);
    }

    const dom = inputRef.current;
    const saveDraft = () => localStorage.setItem(key, dom?.value ?? "");
    window.addEventListener("campus:before-reload", saveDraft);
    window.addEventListener("beforeunload", saveDraft);
    return () => {
      saveDraft();
      window.removeEventListener("campus:before-reload", saveDraft);
      window.removeEventListener("beforeunload", saveDraft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finishImportChoice(choice: AttachmentImportChoice) {
    const resolve = importChoice.current;
    importChoice.current = null;
    setImportDialog(null);
    resolve?.(choice);
  }

  async function importDocument(
    file: File,
    budget: AttachmentBudget,
    alreadyAttached: number,
    maxImages: number,
    signal: AbortSignal,
  ): Promise<DocumentAttachment | undefined> {
    const maxCharacters = Math.max(0, budget.limit - alreadyAttached);
    let pdfRange: PdfPageRange | undefined;
    for (;;) {
      try {
        return await readDocumentAttachment(file, {
          supportsVision: isVisionModel(budget.model),
          maxImages,
          maxCharacters,
          pdfRange,
          signal,
        });
      } catch (error) {
        if (!(error instanceof AttachmentTextLimitError)) throw error;
        const overflow = error;
        signal.throwIfAborted();
        if (!error.prefix.trim()) {
          throw new Error(
            attachmentOverflowLabel(
              error.characterCount,
              budget,
              alreadyAttached,
            ),
          );
        }
        const choice = await new Promise<AttachmentImportChoice>((resolve) => {
          importChoice.current = resolve;
          setImportDialog({
            fileName: file.name,
            overflow,
            budget,
            alreadyAttached,
          });
        });
        signal.throwIfAborted();
        if (!choice) return;
        if (choice === "prefix") {
          const text = validateAttachmentText(error.prefix);
          const kept = attachmentCharacterCount(text);
          const portion = error.pdf?.range
            ? `${pdfPageLabel(error.pdf.range)}的`
            : "";
          return {
            text,
            images: [],
            notice: `已载入${portion}前 ${attachmentPrefixPercent(
              kept,
              error.characterCount,
            )} 内容（${numberLabel(kept)} / ${numberLabel(
              error.characterCount,
            )} 字符）。`,
          };
        }
        pdfRange = choice;
      }
    }
  }

  async function addFiles(files: File[]) {
    if (!files.length || uploadInProgress.current || preparing.current) return;
    const controller = new AbortController();
    uploadController.current = controller;
    const owner = currentIdentity();
    const currentSession = () => useChatStore.getState().currentSession();
    const active = () =>
      mounted.current &&
      owner === currentIdentity() &&
      currentSession().id === session.id;
    const currentBudget = () => {
      const state = currentSession();
      return attachmentBudget(
        state.mask.modelConfig.model,
        state.contextWindow,
      );
    };
    uploadInProgress.current = true;
    setUploading(true);
    setAttachmentError("");
    const nextImages = [...attachImages];
    const nextOriginals = new Map(originalImages.current);
    const nextImageSources = [...imageSources.current];
    const nextDocuments = [...documents];
    const errors: string[] = [];
    let nextAudio: File | undefined;
    try {
      for (const file of files.slice(0, MAX_FILES)) {
        if (!active()) return;
        try {
          if (isAudioFile(file)) {
            nextAudio = file;
            continue;
          }
          const budget = currentBudget();
          const kind = attachmentKind(file);
          if (kind === "image") {
            if (!isVisionModel(budget.model)) {
              throw new Error("当前模型不支持图片，请先切换支持视觉的模型。");
            }
            if (nextImages.length >= MAX_IMAGES)
              throw new Error(
                `每条消息最多添加 ${MAX_IMAGES} 张图片（含 PDF 页面）。`,
              );
            const imageUrl = await prepareImageAttachment(
              file,
              controller.signal,
            );
            if (!active()) return;
            if (!isVisionModel(currentBudget().model)) {
              throw new Error("当前模型不支持图片，请先切换支持视觉的模型。");
            }
            nextImages.push(imageUrl);
            nextOriginals.set(imageUrl, file);
            nextImageSources.push(null);
          } else {
            if (nextDocuments.length >= MAX_DOCUMENTS)
              throw new Error(`每条消息最多添加 ${MAX_DOCUMENTS} 份文档。`);
            const alreadyAttached = attachmentCharacters(nextDocuments);
            const imported = await importDocument(
              file,
              budget,
              alreadyAttached,
              MAX_IMAGES - nextImages.length,
              controller.signal,
            );
            if (!active()) return;
            if (!imported) continue;
            const { text, images, imagePageNumbers, notice } = imported;
            const latestBudget = currentBudget();
            const count = attachmentCharacterCount(text);
            if (alreadyAttached + count > latestBudget.limit) {
              throw new Error(
                attachmentOverflowLabel(count, latestBudget, alreadyAttached),
              );
            }
            if (images.length && !isVisionModel(latestBudget.model)) {
              throw new Error("当前模型不支持图片，请先切换支持视觉的模型。");
            }
            // Append the complete PDF result only after both budgets pass. Its page
            // images are already sized JPEG data URLs and must not be compressed again.
            const id = crypto.randomUUID();
            nextDocuments.push({
              id,
              name: file.name,
              text,
              ...(/\.(csv|xlsx)$/i.test(file.name) ? { labFile: file } : {}),
              imageUrls: images.length ? images : undefined,
              notice,
            });
            nextImages.push(...images);
            nextImageSources.push(
              ...images.map((_, index) => ({
                documentId: id,
                page: imagePageNumbers?.[index] ?? index + 1,
              })),
            );
          }
        } catch (error) {
          if (!active()) return;
          if (error instanceof AttachmentFileSizeError) {
            const budget = currentBudget();
            errors.push(
              `${file.name}：${error.message}${attachmentLimitLabel(budget)}${
                budget.hint
              }`,
            );
            continue;
          }
          errors.push(
            `${file.name}（${fileSizeLabel(file.size)}）${
              error instanceof Error ? error.message : "读取失败，请重试。"
            }`,
          );
        }
      }
      if (files.length > MAX_FILES)
        errors.push(`一次最多添加 ${MAX_FILES} 个文件，多余文件未添加。`);
      if (active()) {
        imageSources.current = nextImageSources;
        originalImages.current = nextOriginals;
        setAttachImages(nextImages);
        setDocuments(nextDocuments);
        if (nextAudio) {
          setAudioFile(nextAudio);
          setAudioOpen(true);
        }
        if (errors.length) reportAttachmentError(errors.join("\n"));
      }
    } finally {
      uploadController.current = null;
      uploadInProgress.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  function removeDocument(document: TextAttachment) {
    if (uploadInProgress.current) return;
    // Remove only this document's remaining occurrences, including identical pages.
    const remaining = new Map<string, number>();
    document.imageUrls?.forEach((url) =>
      remaining.set(url, (remaining.get(url) ?? 0) + 1),
    );
    const keptSources: typeof imageSources.current = [];
    const keptImages = attachImages.filter((image, index) => {
      const source = imageSources.current[index] ?? null;
      const count = remaining.get(image) ?? 0;
      if (source?.documentId === document.id && count > 0) {
        remaining.set(image, count - 1);
        return false;
      }
      keptSources.push(source);
      return true;
    });
    imageSources.current = keptSources;
    setAttachImages(keptImages);
    setDocuments((items) => items.filter((item) => item.id !== document.id));
  }

  function removeImage(index: number) {
    if (uploadInProgress.current) return;
    const source = imageSources.current[index];
    const removed = attachImages[index];
    if (
      removed &&
      !attachImages.some((value, i) => i !== index && value === removed)
    ) {
      originalImages.current.delete(removed);
    }
    const pageIndex = imageSources.current
      .slice(0, index)
      .filter((item) => item?.documentId === source?.documentId).length;
    imageSources.current = imageSources.current.filter((_, i) => i !== index);
    setAttachImages((images) => images.filter((_, i) => i !== index));
    if (source) {
      const pages = imageSources.current
        .filter((item) => item?.documentId === source.documentId)
        .map((item) => item!.page);
      const adjustment = pages.length
        ? `手动调整：现在仅附第 ${pages.join(
            "、",
          )} 页的图片，其他页面图片已移除。`
        : "手动调整：全部页面图片已移除，现在仅附文件说明与已提取文字。";
      setDocuments((items) =>
        items.map((item) =>
          item.id === source.documentId
            ? {
                ...item,
                imageUrls: item.imageUrls?.filter((_, i) => i !== pageIndex),
                notice: [item.notice?.split("\n手动调整：")[0], adjustment]
                  .filter(Boolean)
                  .join("\n"),
                text:
                  item.text.replace(/\n\n\[页面调整\][\s\S]*$/, "") +
                  `\n\n[页面调整]\n${adjustment}`,
              }
            : item,
        ),
      );
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      void addFiles(files);
    }
  }

  function uploadImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${ATTACHMENT_ACCEPT},${AUDIO_ACCEPT}`;
    input.multiple = true;
    input.onchange = () => void addFiles(Array.from(input.files ?? []));
    input.click();
  }

  // 快捷键 shortcut keys
  const [showShortcutKeyModal, setShowShortcutKeyModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 打开新聊天 command + shift + o
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "o"
      ) {
        event.preventDefault();
        setTimeout(() => {
          chatStore.newSession();
          navigate(Path.Chat);
        }, 10);
      }
      // 聚焦聊天输入 shift + esc
      else if (event.shiftKey && event.key.toLowerCase() === "escape") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      // 复制最后一个代码块 command + shift + ;
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.code === "Semicolon"
      ) {
        event.preventDefault();
        const copyCodeButton =
          document.querySelectorAll<HTMLElement>(".copy-code-button");
        if (copyCodeButton.length > 0) {
          copyCodeButton[copyCodeButton.length - 1].click();
        }
      }
      // 复制最后一个回复 command + shift + c
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        const lastNonUserMessage = messages
          .filter((message) => message.role !== "user")
          .pop();
        if (lastNonUserMessage) {
          const lastMessageContent = getMessageTextContent(lastNonUserMessage);
          copyToClipboard(lastMessageContent);
        }
      }
      // 展示快捷键 command + /
      else if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcutKeyModal(true);
      }
      // 清除上下文 command + shift + backspace
      else if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "backspace"
      ) {
        event.preventDefault();
        chatStore.updateTargetSession(session, (session) => {
          if (session.clearContextIndex === session.messages.length) {
            session.clearContextIndex = undefined;
          } else {
            session.clearContextIndex = session.messages.length;
            session.memoryPrompt = ""; // will clear memory
          }
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [messages, chatStore, navigate, session]);

  const [showChatSidePanel, setShowChatSidePanel] = useState(false);

  return (
    <>
      <div className={styles.chat} key={session.id}>
        <TocRail
          messages={session.messages}
          onNavigate={(id, heading) => {
            setAutoScroll(false);
            tocNavigationUntil.current = Date.now() + 1200;
            const index = renderMessages.findIndex(
              (message) => message.id === id,
            );
            if (index < 0) return;
            setMsgRenderIndex(Math.max(0, index - CHAT_PAGE_SIZE));
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const element = document.getElementById(`turn-${id}`);
                const target =
                  heading < 0
                    ? element
                    : element?.querySelectorAll(
                        ".markdown-body h1,.markdown-body h2",
                      )[heading];
                target?.scrollIntoView({ behavior: "smooth", block: "start" });
              }),
            );
          }}
        />
        <SelectionActions
          onPrompt={(text) => {
            onInput(text);
            inputRef.current?.focus();
          }}
        />
        {encoderOpen && <LocalEncoder onClose={() => setEncoderOpen(false)} />}
        {libraryOpen && (
          <ReferenceLibrary
            key={session.id}
            sessionId={session.id}
            onClose={() => setLibraryOpen(false)}
          />
        )}
        {audioOpen && (
          <AudioTranscriber
            file={audioFile}
            onClose={() => {
              setAudioOpen(false);
              setAudioFile(undefined);
            }}
            onInsert={(text) => {
              onInput(text);
              inputRef.current?.focus();
            }}
          />
        )}
        {editImage && (
          <ImageAnnotator
            src={editImage}
            onClose={() => setEditImage("")}
            onComplete={(revision) => {
              chatStore.updateTargetSession(session, (s) => {
                s.messages = s.messages.concat(
                  createMessage({ role: "user", content: revision.prompt }),
                  createMessage({
                    role: "assistant",
                    content: "图片微调已完成，可拖动滑块比较修改前后。",
                    model: revision.model,
                    imageRevision: revision,
                  }),
                );
                s.lastUpdate = Date.now();
              });
            }}
          />
        )}
        <div
          className={clsx("window-header", styles["campus-chat-header"])}
          data-zen-hide
          data-tauri-drag-region
        >
          {isMobileScreen && (
            <div className="window-actions">
              <div className={"window-action-button"}>
                <IconButton
                  icon={<ReturnIcon />}
                  bordered
                  title={Locale.Chat.Actions.ChatList}
                  onClick={() => navigate(Path.Home)}
                />
              </div>
            </div>
          )}

          <div
            className={clsx("window-header-title", styles["chat-body-title"])}
          >
            <div
              className={clsx(
                "window-header-main-title",
                styles["chat-body-main-title"],
              )}
              onClickCapture={() => setIsEditingMessage(true)}
            >
              {!session.topic ? DEFAULT_TOPIC : session.topic}
            </div>
            <div className="window-header-sub-title">
              {Locale.Chat.SubTitle(session.messages.length)}
            </div>
          </div>
          <div className="window-actions">
            <div className="window-action-button">
              <IconButton
                icon={<ReloadIcon />}
                bordered
                title={Locale.Chat.Actions.RefreshTitle}
                onClick={() => {
                  showToast(Locale.Chat.Actions.RefreshToast);
                  chatStore.summarizeSession(true, session);
                }}
              />
            </div>
            {!isMobileScreen && (
              <div className="window-action-button">
                <IconButton
                  icon={<RenameIcon />}
                  bordered
                  title={Locale.Chat.EditMessage.Title}
                  aria={Locale.Chat.EditMessage.Title}
                  onClick={() => setIsEditingMessage(true)}
                />
              </div>
            )}
            <div className="window-action-button">
              <IconButton
                icon={<ExportIcon />}
                bordered
                title={Locale.Chat.Actions.Export}
                onClick={() => {
                  setShowExport(true);
                }}
              />
            </div>
            {showMaxIcon && (
              <div className="window-action-button">
                <IconButton
                  icon={config.tightBorder ? <MinIcon /> : <MaxIcon />}
                  bordered
                  title={Locale.Chat.Actions.FullScreen}
                  aria={Locale.Chat.Actions.FullScreen}
                  onClick={() => {
                    config.update(
                      (config) => (config.tightBorder = !config.tightBorder),
                    );
                  }}
                />
              </div>
            )}
          </div>

          <div className={clsx(campusStyles.toolbar, styles["header-tools"])}>
            <WorkspaceTheme />
            <button
              type="button"
              aria-label="快捷命令"
              title="Ctrl / Cmd + K"
              onClick={() => window.dispatchEvent(new Event("campus:commands"))}
            >
              ⌘ K
            </button>
            <button onClick={() => setLibraryOpen(true)}>本会话资料库</button>
            <button onClick={() => useFinale.getState().toggleZen()}>
              专注阅读
            </button>
          </div>
          <PromptToast
            showToast={!hitBottom}
            showModal={showPromptModal}
            setShowModal={setShowPromptModal}
          />
        </div>
        <div className={styles["chat-main"]}>
          <div className={styles["chat-body-container"]}>
            <div
              className={clsx(styles["chat-body"], {
                [styles["chat-body-empty"]]: session.messages.length === 0,
              })}
              ref={scrollRef}
              onScroll={(e) => onChatBodyScroll(e.currentTarget)}
              onMouseDown={() => inputRef.current?.blur()}
              onTouchStart={() => {
                inputRef.current?.blur();
                setAutoScroll(false);
              }}
            >
              {session.messages.length === 0 && (
                <WelcomeCard
                  compact
                  onWorkflowSelect={(id, prompt, image) => {
                    chatStore.updateTargetSession(session, (s) => {
                      s.workflowId = id;
                    });
                    if (image) setEditImage(image);
                    else {
                      onInput(prompt);
                      inputRef.current?.focus();
                    }
                  }}
                  onPromptSelect={(prompt) => {
                    onInput(prompt);
                    inputRef.current?.focus();
                  }}
                />
              )}
              {messages
                // TODO
                // .filter((m) => !m.isMcpResponse)
                .map((message, i) => {
                  const isUser = message.role === "user";
                  const reasoned = isUser
                    ? null
                    : splitReasoning(getMessageTextContent(message));
                  const isContext = i < context.length;
                  const showActions =
                    !(message.preview || message.content.length === 0) &&
                    !isContext;
                  const showTyping = message.preview || message.streaming;

                  const shouldShowClearContextDivider =
                    i === clearContextIndex - 1;

                  return (
                    <Fragment key={message.id}>
                      <div
                        id={`turn-${message.id}`}
                        className={
                          isUser
                            ? styles["chat-message-user"]
                            : styles["chat-message"]
                        }
                      >
                        <div className={styles["chat-message-container"]}>
                          <div className={styles["chat-message-header"]}>
                            <div className={styles["chat-message-avatar"]}>
                              <div className={styles["chat-message-edit"]}>
                                <IconButton
                                  icon={<EditIcon />}
                                  aria={Locale.Chat.Actions.Edit}
                                  onClick={async () => {
                                    const newMessage = await showPrompt(
                                      Locale.Chat.Actions.Edit,
                                      getMessageTextContent(message),
                                      10,
                                    );
                                    let newContent:
                                      | string
                                      | MultimodalContent[] = newMessage;
                                    const images = getMessageImages(message);
                                    if (images.length > 0) {
                                      newContent = [
                                        { type: "text", text: newMessage },
                                      ];
                                      for (let i = 0; i < images.length; i++) {
                                        newContent.push({
                                          type: "image_url",
                                          image_url: {
                                            url: images[i],
                                          },
                                        });
                                      }
                                    }
                                    chatStore.updateTargetSession(
                                      session,
                                      (session) => {
                                        const m = session.mask.context
                                          .concat(session.messages)
                                          .find((m) => m.id === message.id);
                                        if (m) {
                                          m.content = newContent;
                                        }
                                      },
                                    );
                                  }}
                                ></IconButton>
                              </div>
                              {isUser ? (
                                <Avatar avatar={config.avatar} />
                              ) : (
                                <>
                                  {["system"].includes(message.role) ? (
                                    <Avatar avatar="2699-fe0f" />
                                  ) : (
                                    <MaskAvatar
                                      avatar={session.mask.avatar}
                                      model={
                                        message.model ||
                                        session.mask.modelConfig.model
                                      }
                                    />
                                  )}
                                </>
                              )}
                            </div>
                            {!isUser && (
                              <div className={styles["chat-model-name"]}>
                                {message.model}
                              </div>
                            )}

                            {showActions && (
                              <div className={styles["chat-message-actions"]}>
                                <div className={styles["chat-input-actions"]}>
                                  {message.streaming ? (
                                    <ChatAction
                                      text={Locale.Chat.Actions.Stop}
                                      icon={<StopIcon />}
                                      onClick={() =>
                                        onUserStop(message.id ?? i)
                                      }
                                    />
                                  ) : (
                                    <>
                                      <ChatAction
                                        text={Locale.Chat.Actions.Retry}
                                        icon={<ResetIcon />}
                                        onClick={() => onResend(message)}
                                      />

                                      <ChatAction
                                        text={Locale.Chat.Actions.Delete}
                                        icon={<DeleteIcon />}
                                        onClick={() =>
                                          onDelete(message.id ?? i)
                                        }
                                      />

                                      <ChatAction
                                        text={Locale.Chat.Actions.Pin}
                                        icon={<PinIcon />}
                                        onClick={() => onPinMessage(message)}
                                      />
                                      <ChatAction
                                        text={Locale.Chat.Actions.Copy}
                                        icon={<CopyIcon />}
                                        onClick={() =>
                                          copyToClipboard(
                                            getMessageTextContent(message),
                                          )
                                        }
                                      />
                                      {config.ttsConfig.enable && (
                                        <ChatAction
                                          text={
                                            speechStatus
                                              ? Locale.Chat.Actions.StopSpeech
                                              : Locale.Chat.Actions.Speech
                                          }
                                          icon={
                                            speechStatus ? (
                                              <SpeakStopIcon />
                                            ) : (
                                              <SpeakIcon />
                                            )
                                          }
                                          onClick={() =>
                                            openaiSpeech(
                                              getMessageTextContent(message),
                                            )
                                          }
                                        />
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          {!isUser && !message?.tools?.length && showTyping && (
                            <div className={styles["chat-message-status"]}>
                              ( •̀ ω •́ )✧ 6.1 Sol 正在疯狂转动脑筋...
                            </div>
                          )}
                          {/*@ts-ignore*/}
                          {message?.tools?.length > 0 && (
                            <div className={styles["chat-message-tools"]}>
                              {message?.tools?.map((tool) => (
                                <div
                                  key={tool.id}
                                  title={tool?.errorMsg}
                                  className={styles["chat-message-tool"]}
                                >
                                  {tool.isError === false ? (
                                    <ConfirmIcon />
                                  ) : tool.isError === true ? (
                                    <CloseIcon />
                                  ) : (
                                    <LoadingButtonIcon />
                                  )}
                                  <span>{tool?.function?.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div
                            className={styles["chat-message-item"]}
                            data-assistant-message={
                              !isUser ? message.id : undefined
                            }
                          >
                            {reasoned &&
                              (reasoned.reasoning || reasoned.thinking) && (
                                <ReasoningCapsule
                                  text={reasoned.reasoning}
                                  thinking={
                                    !!message.streaming && reasoned.thinking
                                  }
                                  startedAt={message.reasoningStartedAt}
                                  durationMs={message.reasoningDurationMs}
                                  effort={message.reasoningEffort}
                                  fallback={message.reasoningFallback}
                                  model={message.model}
                                />
                              )}
                            <Markdown
                              key={message.streaming ? "loading" : "done"}
                              content={
                                reasoned
                                  ? reasoned.answer
                                  : getMessageTextContent(message)
                              }
                              loading={
                                (message.preview || message.streaming) &&
                                message.content.length === 0 &&
                                !isUser
                              }
                              //   onContextMenu={(e) => onRightClick(e, message)} // hard to use
                              onDoubleClickCapture={() => {
                                if (!isMobileScreen) return;
                                setUserInput(getMessageTextContent(message));
                              }}
                              fontSize={fontSize}
                              fontFamily={fontFamily}
                              parentRef={scrollRef}
                              defaultShow={i >= messages.length - 6}
                            />
                            {!isUser && !message.preview && (
                              <>
                                <SourceCitations
                                  sessionId={session.id}
                                  sources={message.sources}
                                  links={message.webSources}
                                />
                                {message.searchNotice && (
                                  <p className={campusStyles.notice}>
                                    {message.searchNotice}
                                  </p>
                                )}
                                {message.imageRevision && (
                                  <ImageComparison
                                    revision={message.imageRevision}
                                    onEdit={() =>
                                      setEditImage(message.imageRevision!.after)
                                    }
                                  />
                                )}
                                {!message.streaming && !message.isError && (
                                  <AssistantExports
                                    content={
                                      reasoned?.answer ??
                                      getMessageTextContent(message)
                                    }
                                  />
                                )}
                              </>
                            )}
                            {showActions &&
                              !message.streaming &&
                              !message.isError && (
                                <MessageActions
                                  key={message.id}
                                  messageId={message.id}
                                  content={
                                    reasoned?.answer ??
                                    getMessageTextContent(message)
                                  }
                                  original={originals.get(message.id)}
                                  assistant={!isUser}
                                />
                              )}
                            {getMessageImages(message).length == 1 && (
                              <img
                                className={styles["chat-message-item-image"]}
                                src={getMessageImages(message)[0]}
                                alt=""
                              />
                            )}
                            {getMessageImages(message).length > 1 && (
                              <div
                                className={styles["chat-message-item-images"]}
                                style={
                                  {
                                    "--image-count":
                                      getMessageImages(message).length,
                                  } as React.CSSProperties
                                }
                              >
                                {getMessageImages(message).map(
                                  (image, index) => {
                                    return (
                                      <img
                                        className={
                                          styles[
                                            "chat-message-item-image-multi"
                                          ]
                                        }
                                        key={index}
                                        src={image}
                                        alt=""
                                      />
                                    );
                                  },
                                )}
                              </div>
                            )}
                          </div>
                          {message?.audio_url && (
                            <div className={styles["chat-message-audio"]}>
                              <audio src={message.audio_url} controls />
                            </div>
                          )}

                          {!isUser &&
                            !message.preview &&
                            !message.streaming &&
                            getMessageTextContent(message) && (
                              <IconButton
                                icon={<CopyIcon />}
                                text={
                                  copiedMessage === message.id
                                    ? "已复制"
                                    : "复制回复"
                                }
                                aria="复制回复"
                                bordered
                                className={styles["reply-copy"]}
                                onClick={async () => {
                                  const copied = await copyToClipboard(
                                    getMessageTextContent(message),
                                  );
                                  if (copied) setCopiedMessage(message.id);
                                }}
                              />
                            )}
                          <div className={styles["chat-message-action-date"]}>
                            {isContext
                              ? Locale.Chat.IsContext
                              : message.date.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {shouldShowClearContextDivider && <ClearContextDivider />}
                    </Fragment>
                  );
                })}
            </div>
            <div
              className={clsx(styles["chat-input-panel"], {
                [styles["drop-active"]]: dragging,
              })}
              data-zen-hide
              onDragEnter={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                dragDepth.current++;
                setDragging(true);
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("Files")) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              onDrop={(event) => {
                if (!event.dataTransfer.types.includes("Files")) return;
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                void addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              {dragging && (
                <div className={styles["drop-overlay"]} role="status">
                  松开即可添加图片、PDF、Word、PPTX、Excel、文本或代码文件
                </div>
              )}
              {attachmentError && (
                <div className={styles["attachment-error"]} role="alert">
                  {attachmentError}
                </div>
              )}
              {documents.some((document) => document.notice) && (
                <div className={styles["attachment-notice"]} role="status">
                  {documents
                    .filter((document) => document.notice)
                    .map((document) => (
                      <div key={document.id}>
                        <strong>{document.name}</strong>：{document.notice}
                      </div>
                    ))}
                </div>
              )}
              {documents.length > 0 && (
                <div
                  className={styles["document-attachments"]}
                  aria-label="待发送文档"
                >
                  {documents.map((document) => (
                    <div key={document.id} className={styles["document-chip"]}>
                      <span title={document.name}>{document.name}</span>
                      {document.labFile && (
                        <button
                          type="button"
                          onClick={() =>
                            useCapstone.setState({ file: document.labFile! })
                          }
                        >
                          数据预览与拟合
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`移除 ${document.name}`}
                        disabled={uploading}
                        onClick={() => removeDocument(document)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <ContextCompactor key={session.id} session={session} />
              <SlashAutocomplete
                input={userInput}
                onSelect={(text) => {
                  setUserInput(text);
                  setPromptHints([]);
                  inputRef.current?.focus();
                }}
              />
              <PromptHints
                prompts={promptHints}
                onPromptSelect={onPromptSelect}
              />

              <div className={styles["composer-tools"]}>
                <ChatActions
                  uploadImage={uploadImage}
                  captureImage={(file) => {
                    void addFiles([file]);
                  }}
                  setAttachImages={setAttachImages}
                  setUploading={setUploading}
                  showPromptModal={() => setShowPromptModal(true)}
                  scrollToBottom={scrollToBottom}
                  hitBottom={hitBottom}
                  uploading={uploading}
                  showPromptHints={() => {
                    // Click again to close
                    if (promptHints.length > 0) {
                      setPromptHints([]);
                      return;
                    }

                    inputRef.current?.focus();
                    setUserInput("/");
                    onSearch("");
                  }}
                  setShowShortcutKeyModal={setShowShortcutKeyModal}
                  setUserInput={setUserInput}
                  setShowChatSidePanel={setShowChatSidePanel}
                />
                <div
                  className={clsx(
                    campusStyles.toolbar,
                    styles["composer-campus-tools"],
                  )}
                >
                  <div className={finaleStyles.composerTools}>
                    <button
                      type="button"
                      onClick={() => useFinale.getState().open("equations")}
                    >
                      ƒ 公式草稿本
                    </button>
                    <VoiceDictation
                      key={session.id}
                      onInsert={(text) => {
                        setUserInput(
                          (input) =>
                            input +
                            (input && !/\s$/.test(input) ? " " : "") +
                            text,
                        );
                      }}
                    />
                  </div>
                  {attachImages.length > 1 && (
                    <select
                      aria-label="选择精修图片"
                      value={Math.min(editSelection, attachImages.length - 1)}
                      onChange={(e) => setEditSelection(Number(e.target.value))}
                    >
                      {attachImages.map((_, i) => (
                        <option value={i} key={i}>
                          图片 {i + 1}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    aria-pressed={session.webSearch === true}
                    onClick={() =>
                      chatStore.updateTargetSession(session, (s) => {
                        s.webSearch = !s.webSearch;
                      })
                    }
                  >
                    联网检索{session.webSearch ? " · 开" : ""}
                  </button>
                  <button type="button" onClick={() => setAudioOpen(true)}>
                    音频转文字
                  </button>
                  {attachImages.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        const source =
                            attachImages[
                              Math.min(editSelection, attachImages.length - 1)
                            ],
                          original = originalImages.current.get(source);
                        if (!original) {
                          setEditImage(source);
                          return;
                        }
                        const owner = currentIdentity();
                        try {
                          const data = await new Promise<string>(
                            (resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () =>
                                resolve(String(reader.result));
                              reader.onerror = () =>
                                reject(new Error("原图读取失败"));
                              reader.readAsDataURL(original);
                            },
                          );
                          if (owner === currentIdentity() && mounted.current)
                            setEditImage(data);
                        } catch (e) {
                          setAttachmentError((e as Error).message);
                        }
                      }}
                    >
                      图片精修模式
                    </button>
                  )}
                  <ContextMeter
                    session={session}
                    content={messageWithAttachments(userInput, documents)}
                    images={attachImages}
                    revision={libraryOpen}
                  />
                </div>
              </div>
              {session.workflowId && (
                <div className={juniorStyles.specialist}>
                  <span>
                    🎯 专攻：
                    {
                      WORKFLOWS.find((flow) => flow.id === session.workflowId)
                        ?.title
                    }
                  </span>
                  <button
                    type="button"
                    aria-label="解除专攻锁定"
                    onClick={() =>
                      chatStore.updateTargetSession(session, (s) => {
                        s.workflowId = undefined;
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              )}
              <label
                className={clsx(styles["chat-input-panel-inner"], {
                  [styles["chat-input-panel-inner-attach"]]:
                    attachImages.length !== 0,
                })}
                htmlFor="chat-input"
              >
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  className={styles["chat-input"]}
                  placeholder={
                    WORKSPACE_QUOTES[quoteIndex % WORKSPACE_QUOTES.length]
                  }
                  aria-label="消息输入框"
                  onInput={(e) => onInput(e.currentTarget.value)}
                  value={userInput}
                  onKeyDown={onInputKeyDown}
                  onFocus={scrollToBottom}
                  onClick={scrollToBottom}
                  onPaste={handlePaste}
                  rows={inputRows}
                  autoFocus={autoFocus}
                  style={{
                    fontSize: config.fontSize,
                    fontFamily: config.fontFamily,
                  }}
                />
                {attachImages.length != 0 && (
                  <div
                    className={styles["attach-images"]}
                    tabIndex={0}
                    role="group"
                    aria-label={`待发送图片，共 ${attachImages.length} 张；可左右滚动查看`}
                  >
                    {attachImages.map((image, index) => {
                      const source = imageSources.current[index];
                      const document =
                        source &&
                        documents.find((item) => item.id === source.documentId);
                      const description = document
                        ? `${document.name}，第 ${source!.page} 页`
                        : `第 ${index + 1} 张图片`;
                      return (
                        <div
                          key={index}
                          className={styles["attach-image"]}
                          style={{ backgroundImage: `url("${image}")` }}
                          title={description}
                        >
                          <span className={styles["attach-image-label"]}>
                            {source ? `第 ${source.page} 页` : index + 1}
                          </span>
                          <div className={styles["attach-image-mask"]}>
                            <DeleteImageButton
                              disabled={uploading}
                              label={`移除${description}`}
                              deleteImage={() => removeImage(index)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <IconButton
                  icon={<SendWhiteIcon />}
                  text={Locale.Chat.Send}
                  className={styles["chat-input-send"]}
                  type="primary"
                  onClick={() => doSubmit(userInput)}
                  disabled={uploading || isLoading}
                  aria="发送消息"
                />
              </label>
            </div>
          </div>
          <div
            className={clsx(styles["chat-side-panel"], {
              [styles["mobile"]]: isMobileScreen,
              [styles["chat-side-panel-show"]]: showChatSidePanel,
            })}
          >
            {showChatSidePanel && (
              <RealtimeChat
                onClose={() => {
                  setShowChatSidePanel(false);
                }}
                onStartVoice={async () => {
                  console.log("start voice");
                }}
              />
            )}
          </div>
        </div>
      </div>
      {showExport && (
        <ExportMessageModal onClose={() => setShowExport(false)} />
      )}

      {isEditingMessage && (
        <EditMessageModal
          onClose={() => {
            setIsEditingMessage(false);
          }}
        />
      )}

      {showShortcutKeyModal && (
        <ShortcutKeyModal onClose={() => setShowShortcutKeyModal(false)} />
      )}
      {importDialog && (
        <AttachmentImportDialog
          {...importDialog}
          onChoice={finishImportChoice}
        />
      )}
      {attachmentToast &&
        createPortal(
          <div className={styles["attachment-toast"]} aria-hidden="true">
            <Toast content={attachmentToast} />
          </div>,
          document.body,
        )}
    </>
  );
}

export function Chat() {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  return <_Chat key={session.id}></_Chat>;
}
