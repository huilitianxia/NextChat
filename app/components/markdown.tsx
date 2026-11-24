import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import RemarkMath from "remark-math";
import { normalizeMarkdownMath } from "../utils/markdown-math";
import RemarkBreaks from "remark-breaks";
import RehypeKatex from "rehype-katex";
import RemarkGfm from "remark-gfm";
import RehypeHighlight from "rehype-highlight";
import {
  useContext,
  useRef,
  useState,
  RefObject,
  useEffect,
  useMemo,
} from "react";
import { copyToClipboard } from "../utils";
import mermaid from "mermaid";
import Locale from "../locales";
import LoadingIcon from "../icons/three-dots.svg";
import CopyIcon from "../icons/copy.svg";
import ConfirmIcon from "../icons/confirm.svg";
import React from "react";
import { useDebouncedCallback } from "use-debounce";
import { showImageModal } from "./ui-lib";
import EngineeringPlot, { PlotErrorBoundary } from "./engineering-plot";
import SimulationImage from "./simulation-image";
import { isSimulationImageUrl } from "../utils/python-stream";
import { useChatStore } from "../store";

import { useAppConfig } from "../store/config";
import clsx from "clsx";
import dynamic from "next/dynamic";
const CodeTools = dynamic(() => import("./code-tools"), { ssr: false });

const MarkdownSource = React.createContext({ source: "", streaming: false });
type SourcePosition = {
  start: { offset?: number; line: number };
  end: { offset?: number; line: number };
};

function codeFenceState(source: string, position?: SourcePosition) {
  const start = position?.start.offset;
  const end = position?.end.offset;
  if (
    start === undefined ||
    end === undefined ||
    position?.start.line === position?.end.line
  )
    return "open";
  const opening = /^(`{3,}|~{3,})/.exec(source.slice(start))?.[1];
  const startOfLastLine =
    Math.max(
      source.lastIndexOf("\n", end - 1),
      source.lastIndexOf("\r", end - 1),
    ) + 1;
  const closing = /^(?:[ \t]*>[ \t]*)*[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(
    source.slice(startOfLastLine, end),
  )?.[1];
  if (!opening || !closing?.startsWith(opening)) return "open";
  if (end === source.length) return "terminal";
  return /^[\r\n]/.test(source.slice(end, end + 1)) ? "closed" : "open";
}

function plotLanguage(language: string, code: string) {
  if (language === "svg" || language === "html") return language;
  if (!language || language === "xml") {
    if (/^\s*(?:<\?xml[^?]*\?>\s*)?<svg\b/i.test(code)) return "svg";
    if (/^\s*(?:<!doctype\s+html\b|<html[\s>])/i.test(code)) return "html";
  }
}

function hasPlotMarkup(kind: "svg" | "html", code: string) {
  if (kind === "svg") {
    return /<svg\b[^>]*\/>|<svg\b[^>]*>[\s\S]*<\/svg\s*>/i.test(code);
  }
  return /<(?:html|head|body|main|section|article|iframe|div|p|span|pre|ul|ol|form|button|canvas|svg|script|style|img|table|h[1-6])(?:\s[^<>]*)?\/?>/i.test(
    code,
  );
}

export function Mermaid(props: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (props.code && ref.current) {
      mermaid
        .run({
          nodes: [ref.current],
          suppressErrors: true,
        })
        .catch((e) => {
          setHasError(true);
          console.error("[Mermaid] ", e.message);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.code]);

  function viewSvgInNewWindow() {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], { type: "image/svg+xml" });
    showImageModal(URL.createObjectURL(blob));
  }

  if (hasError) {
    return null;
  }

  return (
    <div
      className={clsx("no-dark", "mermaid")}
      style={{
        cursor: "pointer",
        overflow: "auto",
      }}
      ref={ref}
      onClick={() => viewSvgInNewWindow()}
    >
      {props.code}
    </div>
  );
}

export function PreCode(props: {
  children: any;
  node?: { position?: SourcePosition };
}) {
  const blockChild = React.Children.toArray(props.children).find((child) =>
    React.isValidElement<{ className?: string }>(child),
  );
  const rawLanguage = React.isValidElement<{ className?: string }>(blockChild)
    ? blockChild.props.className?.match(/language-([^\s]+)/)?.[1] || ""
    : "";
  const textOf = (node: React.ReactNode): string =>
    React.Children.toArray(node)
      .map((child) =>
        typeof child === "string" || typeof child === "number"
          ? String(child)
          : React.isValidElement<{ children?: React.ReactNode }>(child)
          ? textOf(child.props.children)
          : "",
      )
      .join("");
  const blockText = textOf(props.children).replace(/\n$/, "");
  const { source, streaming } = useContext(MarkdownSource);
  const ref = useRef<HTMLPreElement>(null);
  const [mermaidCode, setMermaidCode] = useState("");
  const [copied, setCopied] = useState(false);
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const language = useMemo(() => {
    const code = React.Children.toArray(props.children).find((child) =>
      React.isValidElement<{ className?: string }>(child),
    );
    const className = React.isValidElement<{ className?: string }>(code)
      ? code.props.className ?? ""
      : "";
    const name = className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? "";
    const labels: Record<string, string> = {
      js: "JavaScript",
      javascript: "JavaScript",
      ts: "TypeScript",
      typescript: "TypeScript",
      jsx: "JSX",
      tsx: "TSX",
      python: "Python",
      py: "Python",
      html: "HTML",
      svg: "SVG",
      css: "CSS",
      json: "JSON",
      xml: "XML",
      sql: "SQL",
      bash: "Bash",
      sh: "Shell",
      shell: "Shell",
      md: "Markdown",
      markdown: "Markdown",
      mermaid: "Mermaid",
      cpp: "C++",
      "c++": "C++",
      cs: "C#",
      "c#": "C#",
      txt: "纯文本",
      text: "纯文本",
      plaintext: "纯文本",
    };
    return labels[name.toLowerCase()] ?? (name || "纯文本");
  }, [props.children]);

  const renderArtifacts = useDebouncedCallback(() => {
    if (!ref.current) return;
    const mermaidDom = ref.current.querySelector("code.language-mermaid");
    setMermaidCode(mermaidDom?.textContent ?? "");
  }, 600);

  const config = useAppConfig();
  const enableArtifacts =
    session.mask?.enableArtifacts !== false && config.enableArtifacts;
  const kind = plotLanguage(rawLanguage.toLowerCase(), blockText);
  const fence =
    kind && enableArtifacts && streaming
      ? codeFenceState(source, props.node?.position)
      : "closed";
  const [stableTerminalCode, setStableTerminalCode] = useState<string>();
  useEffect(() => {
    // The answer formatter trims final newlines. Give terminal fences time
    // to settle before creating the iframe, in case another chunk extends one.
    if (fence !== "terminal") return;
    const timer = setTimeout(() => setStableTerminalCode(blockText), 180);
    return () => clearTimeout(timer);
  }, [fence, blockText]);

  //Wrap the paragraph for plain-text
  useEffect(() => {
    if (ref.current) {
      const codeElements = ref.current.querySelectorAll(
        "code",
      ) as NodeListOf<HTMLElement>;
      const wrapLanguages = [
        "",
        "md",
        "markdown",
        "text",
        "txt",
        "plaintext",
        "tex",
        "latex",
      ];
      codeElements.forEach((codeElement) => {
        let languageClass = codeElement.className.match(/language-([^\s]+)/);
        let name = languageClass ? languageClass[1] : "";
        if (wrapLanguages.includes(name)) {
          codeElement.style.whiteSpace = "pre-wrap";
        }
      });
      renderArtifacts();
    }
    setCopied(false);
    return () => renderArtifacts.cancel();
  }, [props.children, renderArtifacts]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const codeView = (
    <div className="code-block" hidden={rawLanguage.toLowerCase() === "quiz"}>
      <div className="code-block-header">
        <span className="code-block-language">{language}</span>
        <button
          type="button"
          aria-label={copied ? "已复制" : "复制代码"}
          className="copy-code-button"
          onClick={async () => {
            const code = ref.current?.querySelector("code")?.textContent ?? "";
            const success = await copyToClipboard(code);
            if (
              success &&
              ref.current?.querySelector("code")?.textContent === code
            )
              setCopied(true);
          }}
        >
          {copied ? (
            <ConfirmIcon className="code-copied-icon" aria-hidden="true" />
          ) : (
            <CopyIcon className="code-copy-icon" aria-hidden="true" />
          )}
          <span aria-live="polite">{copied ? "已复制" : "复制代码"}</span>
        </button>
      </div>
      <pre ref={ref}>{props.children}</pre>
    </div>
  );
  if (kind && enableArtifacts) {
    if (
      fence === "open" ||
      (fence === "terminal" && stableTerminalCode !== blockText)
    ) {
      return (
        <>
          <p role="status">图形生成中…</p>
          {codeView}
        </>
      );
    }
    if (hasPlotMarkup(kind, blockText)) {
      return (
        <PlotErrorBoundary fallback={codeView}>
          <EngineeringPlot kind={kind} code={blockText} codeView={codeView} />
        </PlotErrorBoundary>
      );
    }
  }
  return (
    <>
      {codeView}
      <CodeTools language={rawLanguage} code={blockText} />
      {mermaidCode.length > 0 && (
        <Mermaid code={mermaidCode} key={mermaidCode} />
      )}
    </>
  );
}

function CustomCode(props: { children: any; className?: string }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const config = useAppConfig();
  const enableCodeFold =
    session.mask?.enableCodeFold !== false && config.enableCodeFold;

  const ref = useRef<HTMLPreElement>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [showToggle, setShowToggle] = useState(false);

  useEffect(() => {
    if (ref.current) {
      const codeHeight = ref.current.scrollHeight;
      setShowToggle(codeHeight > 400);
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [props.children]);

  const toggleCollapsed = () => {
    setCollapsed((collapsed) => !collapsed);
  };
  const renderShowMoreButton = () => {
    if (showToggle && enableCodeFold && collapsed) {
      return (
        <div
          className={clsx("show-hide-button", {
            collapsed,
            expanded: !collapsed,
          })}
        >
          <button onClick={toggleCollapsed}>{Locale.NewChat.More}</button>
        </div>
      );
    }
    return null;
  };
  return (
    <>
      <code
        className={clsx(props?.className)}
        ref={ref}
        style={{
          maxHeight: enableCodeFold && collapsed ? "400px" : "none",
          overflowY: "hidden",
        }}
      >
        {props.children}
      </code>

      {renderShowMoreButton()}
    </>
  );
}

function tryWrapHtmlCode(text: string) {
  // try add wrap html code (fixed: html codeblock include 2 newline)
  // ignore embed codeblock
  if (text.includes("```")) {
    return text;
  }
  return text
    .replace(
      /([`]*?)(\w*?)([\n\r]*?)(<!DOCTYPE html>)/g,
      (match, quoteStart, lang, newLine, doctype) => {
        return !quoteStart ? "\n```html\n" + doctype : match;
      },
    )
    .replace(
      /(<\/body>)([\r\n\s]*?)(<\/html>)([\n\r]*)([`]*)([\n\r]*?)/g,
      (match, bodyEnd, space, htmlEnd, newLine, quoteEnd) => {
        return !quoteEnd ? bodyEnd + space + htmlEnd + "\n```\n" : match;
      },
    );
}

function MarkdownImage({
  node,
  src,
  alt,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & {
  node?: { properties?: { src?: unknown } };
}) {
  const originalSrc = node?.properties?.src;
  if (typeof originalSrc === "string" && originalSrc.startsWith("sandbox:/"))
    return <span>{alt}</span>;
  if (src && isSimulationImageUrl(src)) {
    return <SimulationImage src={src} alt={alt || "仿真图表"} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} src={src} alt={alt || ""} />;
}

function _MarkDownContent(props: { content: string; streaming?: boolean }) {
  const escapedContent = useMemo(() => {
    return normalizeMarkdownMath(tryWrapHtmlCode(props.content));
  }, [props.content]);
  const streaming = props.streaming === true;
  const source = useMemo(
    () => ({ source: escapedContent, streaming }),
    [escapedContent, streaming],
  );

  return (
    <MarkdownSource.Provider value={source}>
      <ReactMarkdown
        remarkPlugins={[RemarkMath, RemarkGfm, RemarkBreaks]}
        rehypePlugins={[
          RehypeKatex,
          [
            RehypeHighlight,
            {
              detect: false,
              ignoreMissing: true,
            },
          ],
        ]}
        components={{
          pre: PreCode,
          code: CustomCode,
          img: MarkdownImage,
          p: (pProps) => <p {...pProps} dir="auto" />,
          a: (aProps) => {
            const originalHref = aProps.node.properties?.href;
            if (
              typeof originalHref === "string" &&
              originalHref.startsWith("sandbox:/")
            )
              return <span>{aProps.children}</span>;
            const href = aProps.href || "";
            if (/\.(aac|mp3|opus|wav)$/.test(href)) {
              return (
                <figure>
                  <audio controls src={href}></audio>
                </figure>
              );
            }
            if (/\.(3gp|3g2|webm|ogv|mpeg|mp4|avi)$/.test(href)) {
              return (
                <video controls width="99.9%">
                  <source src={href} />
                </video>
              );
            }
            const isInternal = /^\/#/i.test(href);
            const target = isInternal ? "_self" : aProps.target ?? "_blank";
            return <a {...aProps} target={target} />;
          },
        }}
      >
        {escapedContent}
      </ReactMarkdown>
    </MarkdownSource.Provider>
  );
}

export const MarkdownContent = React.memo(_MarkDownContent);

export function Markdown(
  props: {
    content: string;
    loading?: boolean;
    streaming?: boolean;
    fontSize?: number;
    fontFamily?: string;
    parentRef?: RefObject<HTMLDivElement>;
    defaultShow?: boolean;
  } & React.DOMAttributes<HTMLDivElement>,
) {
  const mdRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="markdown-body"
      style={{
        fontSize: `${props.fontSize ?? 14}px`,
        fontFamily: props.fontFamily || "inherit",
      }}
      ref={mdRef}
      onContextMenu={props.onContextMenu}
      onDoubleClickCapture={props.onDoubleClickCapture}
      dir="auto"
    >
      {props.loading ? (
        <LoadingIcon />
      ) : (
        <MarkdownContent content={props.content} streaming={props.streaming} />
      )}
    </div>
  );
}
