import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import { UNFINISHED_INPUT } from "../constant";
import { currentIdentity, identityStorageKey } from "./identity-storage";
import {
  readLocalRecord,
  reportStorageError,
  writeLocalRecord,
} from "./indexedDB-storage";

export function useChatDraft(sessionId: string, initialPrompt = "") {
  const owner = currentIdentity();
  const key = identityStorageKey(UNFINISHED_INPUT(sessionId), owner);
  const initial = useRef(initialPrompt);
  const edited = useRef(false);
  const current = useRef("");
  const [value, setValue] = useState("");

  const setDraft = useCallback(
    (next: SetStateAction<string>) => {
      if (currentIdentity() !== owner) return;
      edited.current = true;
      current.current =
        typeof next === "function" ? next(current.current) : next;
      setValue(current.current);
      if (owner !== "locked") {
        void writeLocalRecord(key, current.current || null).catch(
          reportStorageError,
        );
      }
    },
    [key, owner],
  );

  useEffect(() => {
    if (owner === "locked") return;
    let active = true;
    void readLocalRecord(key).then((saved) => {
      if (!active || edited.current || currentIdentity() !== owner) return;
      if (saved == null && initial.current) setDraft(initial.current);
      else {
        current.current = saved || "";
        setValue(current.current);
      }
    });
    return () => {
      active = false;
    };
  }, [key, owner, setDraft]);

  return [value, setDraft] as const;
}
