import { create } from "zustand";
import {
  currentIdentity,
  identityStorageKey,
  registerIdentityStore,
} from "../utils/identity-storage";
import {
  DEFAULT_MACROS,
  PromptMacro,
  validateMacros,
} from "../utils/slash-commands";
import type { SourceChunk } from "../utils/campus-types";
export type FinaleTool =
  | "citations"
  | "equations"
  | "toolbox"
  | "macros"
  | "vault";
type State = {
  tool: FinaleTool | null;
  zen: boolean;
  pdf: { source: SourceChunk; sessionId: string; owner: string } | null;
  macros: PromptMacro[];
  error: string;
  open: (tool: FinaleTool | null) => void;
  openPdf: (source: SourceChunk, sessionId: string) => void;
  saveMacros: (macros: PromptMacro[]) => void;
  toggleZen: () => void;
};
export const useFinale = create<State>((set) => ({
  tool: null,
  zen: false,
  pdf: null,
  macros: DEFAULT_MACROS.map((m) => ({ ...m })),
  error: "",
  open: (tool) => set({ tool }),
  toggleZen: () => set((s) => ({ zen: !s.zen })),
  openPdf: (source, sessionId) =>
    set({ pdf: { source, sessionId, owner: currentIdentity() }, zen: false }),
  saveMacros: (items) => {
    const macros = validateMacros(items),
      owner = currentIdentity();
    if (owner === "locked") throw new Error("请先登录再保存指令。");
    localStorage.setItem(
      identityStorageKey("prompt-macros", owner),
      JSON.stringify(macros),
    );
    set({ macros, error: "" });
  },
}));
registerIdentityStore(async (id) => {
  let macros = DEFAULT_MACROS.map((m) => ({ ...m }));
  try {
    const raw = localStorage.getItem(identityStorageKey("prompt-macros", id));
    if (raw) macros = validateMacros(JSON.parse(raw));
  } catch {
    /* Restore defaults for corrupt storage. */
  }
  useFinale.setState({ macros, tool: null, pdf: null, zen: false, error: "" });
});
