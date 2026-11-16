import { create } from "zustand";
import {
  currentIdentity,
  registerIdentityStore,
} from "../utils/identity-storage";
export type ClipDraft = {
  content: string;
  sessionId: string;
  messageId?: string;
};
export const useCapstone = create<{
  clip: ClipDraft | null;
  file: File | null;
  speech: {
    messageId: string;
    sessionId: string;
    content: string;
    owner: string;
    startedAt: number;
  } | null;
}>(() => ({ clip: null, file: null, speech: null }));
export async function clipToVault(clip: ClipDraft) {
  if (currentIdentity() === "locked") return;
  useCapstone.setState({ clip });
  const { useFinale } = await import("./finale");
  useFinale.getState().open("vault");
}
registerIdentityStore(async () => {
  useCapstone.setState({ clip: null, file: null, speech: null });
});
