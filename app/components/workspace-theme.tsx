"use client";
import {
  PALETTES,
  useWorkspacePreferences,
  AppearanceMode,
  Palette,
} from "../store/workspace-preferences";
import { useState } from "react";
import { CampusDialog } from "./campus-dialog";
import styles from "./polish.module.scss";
export default function WorkspaceTheme({
  onClose,
}: { onClose?: () => void } = {}) {
  const prefs = useWorkspacePreferences();
  const [open, setOpen] = useState(false);
  return (
    <>
      {!onClose && (
        <button
          className={styles.themeTrigger}
          type="button"
          aria-label="主题与配色"
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">◐</span>
          <span>外观</span>
        </button>
      )}
      {(open || onClose) && (
        <CampusDialog
          title="主题与配色"
          sheet={!!onClose}
          onClose={onClose ?? (() => setOpen(false))}
        >
          <p className={styles.muted}>
            让工作台贴合你的习惯。设置只属于当前身份。
          </p>
          <div className={styles.modeGroup} aria-label="明暗模式">
            {Object.entries({
              light: "浅色",
              dark: "深色",
              auto: "跟随系统",
            }).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={prefs.mode === mode}
                onClick={() =>
                  prefs.setPreferences({ mode: mode as AppearanceMode })
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className={styles.paletteGrid} aria-label="四种配色">
            {Object.entries(PALETTES).map(([palette, label]) => (
              <button
                type="button"
                data-palette={palette}
                key={palette}
                aria-pressed={prefs.palette === palette}
                onClick={() =>
                  prefs.setPreferences({ palette: palette as Palette })
                }
              >
                <span className={styles.swatch} />
                <strong>{label}</strong>
                <small>
                  {prefs.palette === palette ? "正在使用" : "选择配色"}
                </small>
              </button>
            ))}
          </div>
        </CampusDialog>
      )}
    </>
  );
}
