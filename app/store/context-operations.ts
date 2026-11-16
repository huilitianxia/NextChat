import { create } from "zustand";
import { registerIdentityStore } from "../utils/identity-storage";
export const useContextOperations = create<{
  sessionId: string | null;
  progress: string;
  cancel: (() => void) | null;
}>(() => ({ sessionId: null, progress: "", cancel: null }));
registerIdentityStore(async () => {
  useContextOperations.getState().cancel?.();
  useContextOperations.setState({
    sessionId: null,
    progress: "",
    cancel: null,
  });
});
