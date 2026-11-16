"use client";
import React, {
  Component,
  ComponentType,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { lazyWithRetry } from "../utils/lazy-with-retry";
import styles from "./junior.module.scss";
function Recovery({
  title,
  retry,
  onClose,
}: {
  title: string;
  retry: () => void;
  onClose?: () => void;
}) {
  const [closed, setClosed] = useState(false);
  if (closed || typeof document === "undefined") return null;
  return createPortal(
    <aside className={styles.recovery} role="alert">
      <strong>{title}暂时未能打开</strong>
      <p>可以重试此组件，当前工作台和本地资料会保留。</p>
      <div>
        <button onClick={retry}>重新加载组件</button>
        <button
          onClick={() => {
            setClosed(true);
            onClose?.();
          }}
        >
          关闭提示
        </button>
      </div>
    </aside>,
    document.body,
  );
}
export class ModalErrorBoundary extends Component<
  {
    children: ReactNode;
    title: string;
    onClose?: () => void;
    onRetry?: () => void;
  },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Recovery
        title={this.props.title}
        onClose={this.props.onClose}
        retry={() => {
          if (this.props.onRetry) this.props.onRetry();
          else
            this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
        }}
      />
    ) : (
      <React.Fragment key={this.state.attempt}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
export function lazyModal<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  title: string,
  onClose?: () => void,
) {
  function SafeModal(props: P) {
    const [attempt, setAttempt] = useState(0);
    const closeRef = useRef(
      (props as { onClose?: () => void }).onClose || onClose,
    );
    closeRef.current = (props as { onClose?: () => void }).onClose || onClose;
    const close = useCallback(() => closeRef.current?.(), []);
    const restart = useCallback(() => setAttempt((value) => value + 1), []);
    // Next 14's App Router uses React.lazy, which caches a rejected import.
    // A new dynamic component is required for a real manual retry.
    const Lazy = useMemo(() => {
      const RetryingComponent = dynamic<P>(lazyWithRetry(loader), {
        ssr: false,
        loading: ({ error }) =>
          error ? (
            <Recovery title={title} retry={restart} onClose={close} />
          ) : null,
      });
      RetryingComponent.displayName = `Retryable(${title}:${attempt})`;
      return RetryingComponent;
    }, [attempt, close, restart]);
    return (
      <ModalErrorBoundary
        key={attempt}
        title={title}
        onClose={close}
        onRetry={restart}
      >
        <Lazy {...props} />
      </ModalErrorBoundary>
    );
  }
  SafeModal.displayName = `SafeModal(${title})`;
  return SafeModal;
}
