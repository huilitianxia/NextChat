import { FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import { useAccessStore } from "../store";
import styles from "./auth.module.scss";

export function AuthPage() {
  const navigate = useNavigate();
  const verifyAccessCode = useAccessStore((state) => state.verifyAccessCode);
  const allowAnonymous = useAccessStore(
    (state) => state.configReady && !state.needCode,
  );
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      await verifyAccessCode(password);
      setPassword("");
      navigate(Path.Chat, { replace: true });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "暂时无法验证，请稍后重试。",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className={styles["auth-page"]}>
      <form className={styles["auth-card"]} onSubmit={signIn}>
        <div className={styles["eyebrow"]}>NEXTCHAT · FRIENDS</div>
        <div className={styles["mark"]} aria-hidden="true">
          ✦
        </div>
        <h1>为你留了一席</h1>
        <p className={styles["intro"]}>输入访问密码，开启你的专属对话空间。</p>
        <label htmlFor="friend-password">访问密码</label>
        <input
          id="friend-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="输入你的专属密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          disabled={pending}
          required
          maxLength={256}
          aria-invalid={!!error}
          aria-describedby={error ? "friend-auth-error" : undefined}
        />
        {error && (
          <p id="friend-auth-error" className={styles["error"]} role="alert">
            {error}
          </p>
        )}
        <button
          className={styles["submit"]}
          type="submit"
          disabled={pending || !password.trim()}
        >
          {pending ? "正在验证…" : "进入专属空间"}
          {!pending && <span aria-hidden="true">↗</span>}
        </button>
        {allowAnonymous && (
          <button
            className={styles["guest"]}
            type="button"
            onClick={() => navigate(Path.Chat, { replace: true })}
          >
            无需密码，直接进入 →
          </button>
        )}
        <p className={styles["footnote"]}>
          灵感、问题和没说完的话，都可以从这里开始。
        </p>
      </form>
    </main>
  );
}
