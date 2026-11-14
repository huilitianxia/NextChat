import { ReactNode } from "react";
import { useAccessStore } from "../store";
import styles from "./welcome-card.module.scss";
import clsx from "clsx";

const INSPIRATIONS = [
  {
    kind: "code",
    title: "代码与调试",
    subtitle: "定位报错，理清实现思路",
    prompt:
      "请帮我分析并调试下面的代码。先定位问题原因，再给出修改方案和验证方法：\n\n",
  },
  {
    kind: "document",
    title: "图片 / PDF 解析",
    subtitle: "读懂图像，提炼文档重点",
    prompt:
      "请分析我接下来提供的图片或 PDF，提取关键信息，并说明重要细节与不确定的部分：\n\n",
  },
  {
    kind: "writing",
    title: "写作与翻译",
    subtitle: "保留原意，让表达更自然",
    prompt: "请帮我润色或翻译下面的文字，保留原意并让表达自然清晰：\n\n",
  },
  {
    kind: "reasoning",
    title: "复杂问题拆解",
    subtitle: "梳理思路，找到下一步",
    prompt:
      "请帮我拆解下面的复杂问题，梳理约束、可选方案和可执行的下一步：\n\n",
  },
] as const;

function InspirationIcon(props: {
  kind: (typeof INSPIRATIONS)[number]["kind"];
}) {
  const paths = {
    code: (
      <>
        <path d="m7 8-4 4 4 4m10-8 4 4-4 4M14 5l-4 14" />
      </>
    ),
    document: (
      <>
        <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5M13 3v5h5l-5-5ZM18 8v3M8 11h3M8 15h2" />
        <circle cx="16" cy="16" r="3" />
        <path d="m18.2 18.2 2.8 2.8" />
      </>
    ),
    writing: (
      <>
        <path d="m15 4 5 5M4 20l5-1 11-11a2.1 2.1 0 0 0-5-5L4 14l-1 6h1ZM12 20h9" />
        <path d="m4 14 5 5" />
      </>
    ),
    reasoning: (
      <>
        <rect x="9" y="3" width="6" height="5" rx="1.5" />
        <rect x="2" y="16" width="6" height="5" rx="1.5" />
        <rect x="16" y="16" width="6" height="5" rx="1.5" />
        <path d="M12 8v4M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
      </>
    ),
  };
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[props.kind]}
    </svg>
  );
}

export function WelcomeCard(props: {
  compact?: boolean;
  children?: ReactNode;
  onPromptSelect?: (prompt: string) => void;
}) {
  const profile = useAccessStore((state) => state.friendProfile);
  return (
    <div className={clsx(styles.welcome, { [styles.compact]: props.compact })}>
      <section className={styles.card} aria-label="专属欢迎卡片">
        <div className={styles.eyebrow}>A LITTLE SPACE FOR BIG IDEAS</div>
        <div className={styles.emblem} aria-hidden="true">
          ✦
        </div>
        <span className={styles.badge}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m8 1.5 1.7 4.8L14.5 8l-4.8 1.7L8 14.5 6.3 9.7 1.5 8l4.8-1.7L8 1.5Z" />
          </svg>
          {profile?.badge || "好友专属空间"}
        </span>
        <h1>
          你好，{profile?.name || "朋友"}
          <span className={styles.dot}>。</span>
        </h1>
        <p className={styles.greeting}>
          {profile?.greeting || "很高兴见到你。有什么想法，我们一起聊聊。"}
        </p>
        <div className={styles.features}>
          <div>
            <span aria-hidden="true">↥</span>
            <strong>把灵感拖进来</strong>
            <p title="文本：.txt / .md / .csv / .json / .log；Word：.docx / 文本型 .doc">
              图片、PDF、Word、文本与代码
            </p>
          </div>
          <div>
            <span aria-hidden="true">⧉</span>
            <strong>好答案，随手带走</strong>
            <p>回复与代码，一键复制</p>
          </div>
        </div>
        {props.children}
      </section>
      {props.onPromptSelect && (
        <section className={styles.inspirations} aria-label="灵感起点">
          {INSPIRATIONS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={styles.inspiration}
              onClick={() => props.onPromptSelect?.(item.prompt)}
            >
              <span className={styles["inspiration-icon"]}>
                <InspirationIcon kind={item.kind} />
              </span>
              <span className={styles["inspiration-copy"]}>
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
              </span>
              <svg
                className={styles.arrow}
                width="15"
                height="15"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M4 12 12 4M4 4h8v8" />
              </svg>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
