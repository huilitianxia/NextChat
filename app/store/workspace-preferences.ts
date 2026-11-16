import { create } from "zustand";
import {
  currentIdentity,
  identityStorageKey,
  registerIdentityStore,
} from "../utils/identity-storage";
import { normalizeEffort, ReasoningEffort } from "../utils/reasoning";
export const PALETTES = {
  green: "莫兰迪绿",
  blue: "极客深海蓝",
  purple: "赛博暗紫",
  paper: "暖纸护眼",
} as const;
export type Palette = keyof typeof PALETTES;
export type AppearanceMode = "light" | "dark" | "auto";
export type WorkspacePreferences = {
  mode: AppearanceMode;
  palette: Palette;
  effort: ReasoningEffort;
};
const defaults: WorkspacePreferences = {
  mode: "auto",
  palette: "green",
  effort: "medium",
};
export function validatePreferences(value: any): WorkspacePreferences {
  return {
    mode: ["light", "dark", "auto"].includes(value?.mode) ? value.mode : "auto",
    palette: Object.hasOwn(PALETTES, value?.palette) ? value.palette : "green",
    effort: normalizeEffort(value?.effort),
  };
}
function read(id: string) {
  try {
    return validatePreferences(
      JSON.parse(
        localStorage.getItem(identityStorageKey("workspace-preferences", id)) ||
          "null",
      ),
    );
  } catch {
    return { ...defaults };
  }
}
function bootstrap() {
  if (typeof window === "undefined") return { ...defaults };
  try {
    return read(
      localStorage.getItem("nextchat:appearance:identity") || "locked",
    );
  } catch {
    return { ...defaults };
  }
}
export const useWorkspacePreferences = create<
  WorkspacePreferences & {
    setPreferences: (patch: Partial<WorkspacePreferences>) => void;
  }
>((set, get) => ({
  ...bootstrap(),
  setPreferences(patch) {
    const next = validatePreferences({ ...get(), ...patch });
    set(next);
    const owner = currentIdentity();
    if (owner === "locked") return;
    try {
      localStorage.setItem(
        identityStorageKey("workspace-preferences", owner),
        JSON.stringify(next),
      );
      localStorage.setItem("nextchat:appearance:identity", owner);
    } catch {
      /* Keep the current appearance even if browser storage is unavailable. */
    }
  },
}));
registerIdentityStore(async (id) => {
  useWorkspacePreferences.setState(read(id));
  if (typeof localStorage === "undefined") return;
  try {
    if (id === "locked")
      localStorage.removeItem("nextchat:appearance:identity");
    else localStorage.setItem("nextchat:appearance:identity", id);
  } catch {
    /* Private browsing may deny storage. */
  }
});
