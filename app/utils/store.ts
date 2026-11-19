import { create } from "zustand";
import { combine, persist, createJSONStorage } from "zustand/middleware";
import { Updater } from "../typing";
import { StoreKey } from "../constant";
import { deepClone } from "./clone";
import { nanoid } from "nanoid";
import {
  indexedDBStorage,
  lightweightStorage,
} from "@/app/utils/indexedDB-storage";
import {
  currentIdentity,
  identityStorageKey,
  registerIdentityStore,
} from "./identity-storage";

type SecondParam<T> = T extends (
  _f: infer _F,
  _s: infer S,
  ...args: infer _U
) => any
  ? S
  : never;

type MakeUpdater<T> = {
  lastUpdateTime: number;
  _hasHydrated: boolean;

  markUpdate: () => void;
  update: Updater<T>;
  setHasHydrated: (state: boolean) => void;
};

type SetStoreState<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: boolean | undefined,
) => void;

export function createPersistStore<T extends object, M>(
  state: T,
  methods: (
    set: SetStoreState<T & MakeUpdater<T>>,
    get: () => T & MakeUpdater<T>,
  ) => M,
  persistOptions: SecondParam<typeof persist<T & M & MakeUpdater<T>>>,
) {
  const originalName = persistOptions.name;
  const scoped = originalName !== StoreKey.Access;
  const storage =
    originalName === StoreKey.Config || !scoped
      ? lightweightStorage
      : indexedDBStorage;
  let suspended = false;
  if (scoped) persistOptions.name = identityStorageKey(originalName);
  persistOptions.storage = createJSONStorage(() => ({
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) =>
      suspended || (scoped && currentIdentity() === "locked")
        ? Promise.resolve()
        : storage.setItem(key, value),
    removeItem: (key: string) => storage.removeItem(key),
  }));
  const oldOonRehydrateStorage = persistOptions?.onRehydrateStorage;
  persistOptions.onRehydrateStorage = (state) => {
    oldOonRehydrateStorage?.(state);
    return () => state.setHasHydrated(true);
  };

  const store = create(
    persist(
      combine(
        {
          ...state,
          lastUpdateTime: 0,
          _hasHydrated: false,
        },
        (set, get) => {
          return {
            ...methods(set, get as any),

            markUpdate() {
              set({ lastUpdateTime: Date.now() } as Partial<
                T & M & MakeUpdater<T>
              >);
            },
            update(updater) {
              const state = deepClone(get());
              updater(state);
              set({
                ...state,
                lastUpdateTime: Date.now(),
              });
            },
            setHasHydrated: (state: boolean) => {
              set({ _hasHydrated: state } as Partial<T & M & MakeUpdater<T>>);
            },
          } as M & MakeUpdater<T>;
        },
      ),
      persistOptions as any,
    ),
  );
  if (scoped) {
    registerIdentityStore(async (id) => {
      suspended = true;
      try {
        store.persist.setOptions({
          name: identityStorageKey(originalName, id),
        });
        const fresh = deepClone(state) as any;
        if (
          originalName === "chat-next-web-store" &&
          Array.isArray(fresh.sessions)
        ) {
          fresh.sessions = fresh.sessions.map((session: any) => ({
            ...session,
            id: nanoid(),
          }));
        }
        store.setState({
          ...fresh,
          lastUpdateTime: 0,
          _hasHydrated: false,
        } as any);
        await store.persist.rehydrate();
        store.setState({ _hasHydrated: true } as any);
      } finally {
        suspended = false;
      }
    });
  }
  return store;
}
