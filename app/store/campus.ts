import { create } from "zustand";
import type { Artifact } from "../utils/campus-types";
import { currentIdentity } from "../utils/identity-storage";
export type WorkspaceCommand =
  | { kind: "draft" | "append"; text: string }
  | { kind: "library" | "encoder" };
export const useCampusUI = create<{
  artifact: (Artifact & { owner: string }) | null;
  openArtifact: (value: Artifact) => void;
  closeArtifact: () => void;
  pendingImageEdit: { src: string; sessionId: string; owner: string } | null;
  queueImageEdit: (src: string, sessionId: string) => void;
  clearImageEdit: () => void;
  command: (WorkspaceCommand & { owner: string }) | null;
  dispatch: (command: WorkspaceCommand) => void;
  clearCommand: () => void;
}>((set) => ({
  artifact: null,
  openArtifact: (artifact) =>
    set({ artifact: { ...artifact, owner: currentIdentity() } }),
  closeArtifact: () => set({ artifact: null }),
  pendingImageEdit: null,
  queueImageEdit: (src, sessionId) =>
    set({ pendingImageEdit: { src, sessionId, owner: currentIdentity() } }),
  clearImageEdit: () => set({ pendingImageEdit: null }),
  command: null,
  dispatch: (command) =>
    set({ command: { ...command, owner: currentIdentity() } }),
  clearCommand: () => set({ command: null }),
}));
