import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { useChatStore } from "../store";
import { IconButton } from "./button";
import { WelcomeCard } from "./welcome-card";
import { useCampusUI } from "../store/campus";
import LeftIcon from "../icons/left.svg";
import AddIcon from "../icons/add.svg";
import styles from "./new-chat.module.scss";

export function NewChat() {
  const navigate = useNavigate();
  const newSession = useChatStore((state) => state.newSession);
  return (
    <main className={styles["new-chat"]}>
      <div className={styles.header}>
        <IconButton
          icon={<LeftIcon />}
          text="返回对话"
          aria="返回对话"
          onClick={() => navigate(Path.Chat)}
        />
      </div>
      <div className={styles.content}>
        <WelcomeCard
          onWorkflowSelect={(id, prompt, image) => {
            newSession();
            const store = useChatStore.getState();
            store.updateTargetSession(store.currentSession(), (session) => {
              session.workflowId = id;
              if (!image) session.initialPrompt = prompt;
            });
            if (image)
              useCampusUI
                .getState()
                .queueImageEdit(image, store.currentSession().id);
            navigate(Path.Chat);
          }}
        >
          <div className={styles.actions}>
            <IconButton
              icon={<AddIcon />}
              text="开始新对话"
              aria="开始新对话"
              type="primary"
              onClick={() => {
                newSession();
                navigate(Path.Chat);
              }}
            />
          </div>
        </WelcomeCard>
      </div>
    </main>
  );
}
