"use client";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { WORKFLOWS } from "../config/workflow-templates";
import { MAJOR_LABELS } from "../config/user-profiles";
import { Path } from "../constant";
import { useChatStore } from "../store";
import { currentIdentity } from "../utils/identity-storage";
import { useCampusUI } from "../store/campus";
import { useWorkspacePreferences } from "../store/workspace-preferences";
import { EFFORTS, EFFORT_LABELS } from "../utils/reasoning";
import { CampusDialog } from "./campus-dialog";
import styles from "./polish.module.scss";
import { useFinale, FinaleTool } from "../store/finale";
type Action = {
  id: string;
  title: string;
  keywords: string;
  run: () => void | Promise<void>;
};
export default function WorkspaceCommands() {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [index, setIndex] = useState(0),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    image = useRef<HTMLInputElement>(null);
  const navigate = useNavigate(),
    preferences = useWorkspacePreferences();
  const owner = currentIdentity();
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery("");
        setIndex(0);
      }
    };
    document.addEventListener("keydown", key);
    const openPalette = () => {
      setOpen(true);
      setQuery("");
      setIndex(0);
    };
    window.addEventListener("campus:commands", openPalette);
    return () => {
      document.removeEventListener("keydown", key);
      window.removeEventListener("campus:commands", openPalette);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);
  const actions: Action[] = [
    ...(
      [
        ["vault", "知识手账", "知识 笔记 收藏 课程 Anki 小抄"],
        ["citations", "参考文献格式化器", "DOI arxiv APA IEEE BibTeX 文献"],
        ["equations", "公式草稿本", "LaTeX 数学 公式 PNG"],
        ["toolbox", "专业百宝箱", "建筑 电路 化学 正则 计科 网安 CIDR 计算器"],
        ["macros", "个人快捷指令库", "slash prompt 宏 快捷指令"],
      ] as const
    ).map(([id, title, keywords]) => ({
      id,
      title,
      keywords,
      run: () => {
        useFinale.getState().open(id as FinaleTool);
      },
    })),
    {
      id: "zen",
      title: "切换专注阅读",
      keywords: "zen 专注 沉浸 阅读",
      run: () => {
        useFinale.getState().toggleZen();
        navigate(Path.Chat);
      },
    },
    ...WORKFLOWS.map((flow) => ({
      id: flow.id,
      title: flow.title,
      keywords: `${flow.description} ${flow.major} ${
        MAJOR_LABELS[flow.major]
      } 模板`,
      run: () => {
        const store = useChatStore.getState();
        if (store.currentSession().messages.length) store.newSession();
        store.updateTargetSession(store.currentSession(), (session) => {
          session.workflowId = flow.id;
        });
        if (flow.id === "arch-edit") {
          image.current?.click();
          return;
        }
        useCampusUI.getState().dispatch({ kind: "draft", text: flow.prompt });
        navigate(Path.Chat);
        setOpen(false);
      },
    })),
    {
      id: "dark",
      title: "切换深色 / 浅色模式",
      keywords: "dark light theme 夜间",
      run: () =>
        preferences.setPreferences({
          mode:
            document.documentElement.dataset.theme === "dark"
              ? "light"
              : "dark",
        }),
    },
    {
      id: "search",
      title: "切换联网检索",
      keywords: "web search 搜索",
      run: () => {
        const s = useChatStore.getState();
        s.updateTargetSession(s.currentSession(), (session) => {
          session.webSearch = !session.webSearch;
        });
        navigate(Path.Chat);
      },
    },
    ...(["library", "encoder"] as const).map((kind) => ({
      id: kind,
      title: kind === "library" ? "打开本会话资料库" : "打开本地编码工具",
      keywords: "资料 编码 RAG Base64",
      run: () => {
        useCampusUI.getState().dispatch({ kind });
        navigate(Path.Chat);
      },
    })),
    {
      id: "export",
      title: "导出当前对话",
      keywords: "export JSON 备份",
      run: async () => {
        const session = useChatStore.getState().currentSession();
        const [
          { buildConversationExport },
          { cacheImageToBase64Image },
          { saveFile },
        ] = await Promise.all([
          import("../utils/friend-export"),
          import("../utils/chat"),
          import("../utils/doc-io"),
        ]);
        const data = await buildConversationExport(
          [session],
          cacheImageToBase64Image,
        );
        if (owner === currentIdentity())
          await saveFile(
            new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            }),
            `${session.topic}.json`,
          );
      },
    },
    ...EFFORTS.map((effort) => ({
      id: `effort-${effort}`,
      title: `切换思考强度：${EFFORT_LABELS[effort]}`,
      keywords: `reasoning ${effort}`,
      run: () => preferences.setPreferences({ effort }),
    })),
  ];
  const entries = query.trim()
    ? new Fuse(actions, {
        keys: ["title", "keywords"],
        threshold: 0.4,
        ignoreLocation: true,
      })
        .search(query)
        .map((result) => result.item)
    : actions;
  const activeIndex = Math.min(index, Math.max(0, entries.length - 1));
  async function run(action?: Action) {
    if (!action) return;
    setError("");
    try {
      await action.run();
      if (action.id !== "arch-edit") setOpen(false);
    } catch {
      setError("操作未完成，请稍后重试。");
    }
  }
  return (
    <>
      <input
        hidden
        ref={image}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="命令面板建筑图片"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (
            file.size > 10 * 1024 * 1024 ||
            !["image/png", "image/jpeg", "image/webp"].includes(file.type)
          ) {
            setError("请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片。");
            return;
          }
          try {
            const src = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            if (owner !== currentIdentity()) return;
            const store = useChatStore.getState();
            if (store.currentSession().messages.length) store.newSession();
            store.updateTargetSession(store.currentSession(), (session) => {
              session.workflowId = "arch-edit";
            });
            useCampusUI
              .getState()
              .queueImageEdit(src, store.currentSession().id);
            navigate(Path.Chat);
            setOpen(false);
          } catch {
            setError("图片读取失败。");
          }
        }}
      />
      {open && (
        <CampusDialog title="快捷命令" onClose={() => setOpen(false)}>
          <input
            ref={input}
            className={styles.commandSearch}
            role="combobox"
            aria-label="搜索模板与操作"
            aria-expanded="true"
            aria-controls="campus-command-list"
            aria-activedescendant={
              entries[activeIndex]
                ? `command-${entries[activeIndex].id}`
                : undefined
            }
            placeholder="搜索模板、资料库、思考强度…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key))
                event.preventDefault();
              if (event.key === "ArrowDown")
                setIndex(Math.min(activeIndex + 1, entries.length - 1));
              if (event.key === "ArrowUp")
                setIndex(Math.max(0, activeIndex - 1));
              if (event.key === "Enter") void run(entries[activeIndex]);
            }}
          />
          <div
            className={styles.commandList}
            role="listbox"
            id="campus-command-list"
            aria-label="命令结果"
          >
            {entries.map((action, i) => (
              <button
                id={`command-${action.id}`}
                type="button"
                role="option"
                aria-selected={i === activeIndex}
                key={action.id}
                onMouseEnter={() => setIndex(i)}
                onClick={() => void run(action)}
              >
                {action.title}
                <span aria-hidden="true">↵</span>
              </button>
            ))}
            {!entries.length && <p>没有匹配项，试试“医学”或“深度”。</p>}
          </div>
          <p className={styles.muted}>↑ ↓ 选择 · Enter 执行 · Esc 关闭</p>
          {error && <p role="alert">{error}</p>}
        </CampusDialog>
      )}
    </>
  );
}
