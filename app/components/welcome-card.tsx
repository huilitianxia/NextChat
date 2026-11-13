import { ReactNode } from "react";
import { useAccessStore } from "../store";
import styles from "./welcome-card.module.scss";
import clsx from "clsx";

export function WelcomeCard(props: {
  compact?: boolean;
  children?: ReactNode;
}) {
  const profile = useAccessStore((state) => state.friendProfile);
  return (
    <section
      className={clsx(styles.card, { [styles.compact]: props.compact })}
      aria-label="专属欢迎卡片"
    >
      <div className={styles.eyebrow}>A LITTLE SPACE FOR BIG IDEAS</div>
      <div className={styles.emblem} aria-hidden="true">
        ✦
      </div>
      <span className={styles.badge}>{profile?.badge || "好友专属空间"}</span>
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
          <p>图片、PDF、代码文件</p>
        </div>
        <div>
          <span aria-hidden="true">⧉</span>
          <strong>好答案，随手带走</strong>
          <p>回复与代码，一键复制</p>
        </div>
      </div>
      {props.children}
    </section>
  );
}
