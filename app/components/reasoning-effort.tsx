"use client";
import { useWorkspacePreferences } from "../store/workspace-preferences";
import { EFFORTS, EFFORT_LABELS, ReasoningEffort } from "../utils/reasoning";
import styles from "./polish.module.scss";
export default function ReasoningEffortControl() {
  const { effort, setPreferences } = useWorkspacePreferences();
  return (
    <div className={styles.effort}>
      <div className={styles.effortSegments} role="group" aria-label="思考强度">
        {EFFORTS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={effort === value}
            title={`${value.toUpperCase()} · ${EFFORT_LABELS[value]}`}
            onClick={() => setPreferences({ effort: value })}
          >
            {EFFORT_LABELS[value]}
          </button>
        ))}
      </div>
      <select
        className={styles.effortMobile}
        aria-label="思考强度"
        value={effort}
        onChange={(event) =>
          setPreferences({ effort: event.target.value as ReasoningEffort })
        }
      >
        {EFFORTS.map((value) => (
          <option value={value} key={value}>
            {EFFORT_LABELS[value]}
          </option>
        ))}
      </select>
    </div>
  );
}
