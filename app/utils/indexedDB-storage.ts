import type { StateStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

export const STORAGE_ERROR_EVENT = "nextchat:storage-error";
export const STORAGE_FULL_MESSAGE =
  "浏览器存储空间已满。新内容仍在当前页面，可先复制或导出，再释放存储空间。";

let lastStorageError = 0;

export function reportStorageError(error: unknown) {
  if (typeof window === "undefined" || Date.now() - lastStorageError < 4000)
    return;
  lastStorageError = Date.now();
  const quota =
    (error as { name?: string } | null)?.name === "QuotaExceededError";
  window.dispatchEvent(
    new CustomEvent(STORAGE_ERROR_EVENT, {
      detail: quota
        ? STORAGE_FULL_MESSAGE
        : "本地存储暂不可用，当前页面的新内容可能无法保存。",
    }),
  );
}

function legacyItem(name: string) {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function removeLegacy(name: string) {
  try {
    window.localStorage.removeItem(name);
  } catch {
    // The database can still be used if browser policy disables localStorage.
  }
}

function lastUpdated(value: string) {
  try {
    const state = JSON.parse(value)?.state;
    return Math.max(
      Number(state?.lastUpdateTime) || 0,
      Number(state?.lastUpdate) || 0,
    );
  } catch {
    return 0;
  }
}

// Share the migration with drafts. An old copy remains recoverable if the new
// database write fails, and a newer in-flight draft wins over a legacy copy.
const writes = new Map<string, Promise<void>>();

export async function readLocalRecord(name: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    await writes.get(name);
    const legacy = legacyItem(name);
    const saved = await get<string>(name);
    const pendingWrite = writes.get(name);
    if (pendingWrite) {
      await pendingWrite;
      return (await get<string>(name)) ?? null;
    }
    if (
      legacy !== null &&
      (saved == null || lastUpdated(legacy) > lastUpdated(saved))
    ) {
      await writeLocalRecord(name, legacy);
      return legacy;
    }
    if (saved != null && legacy !== null) removeLegacy(name);
    return saved ?? null;
  } catch (error) {
    reportStorageError(error);
    return legacyItem(name);
  }
}

export function writeLocalRecord(name: string, value: string | null) {
  if (typeof window === "undefined") return Promise.resolve();
  const operation = (writes.get(name) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (value === null) await del(name);
      else await set(name, value);
      removeLegacy(name);
    });
  writes.set(name, operation);
  return operation.finally(() => {
    if (writes.get(name) === operation) writes.delete(name);
  });
}

export const indexedDBStorage = {
  getItem: readLocalRecord,
  async setItem(name, value) {
    if (!JSON.parse(value)?.state?._hasHydrated) return;
    try {
      await writeLocalRecord(name, value);
    } catch (error) {
      reportStorageError(error);
    }
  },
  async removeItem(name) {
    try {
      await writeLocalRecord(name, null);
    } catch (error) {
      reportStorageError(error);
    }
  },
} satisfies StateStorage;

export const lightweightStorage = {
  async getItem(name) {
    if (typeof window === "undefined") return null;
    const local = legacyItem(name);
    let saved: string | undefined;
    try {
      saved = await get<string>(name);
      if (saved == null) return local;
      const preferred =
        local !== null && lastUpdated(local) > lastUpdated(saved)
          ? local
          : saved;
      window.localStorage.setItem(name, preferred);
      await del(name);
      return preferred;
    } catch (error) {
      if (local === null) reportStorageError(error);
      return legacyItem(name) ?? saved ?? null;
    }
  },
  async setItem(name, value) {
    if (
      !JSON.parse(value)?.state?._hasHydrated ||
      typeof window === "undefined"
    )
      return;
    try {
      window.localStorage.setItem(name, value);
      // A previous write may have fallen back to IndexedDB in private mode.
      void del(name).catch(() => {});
    } catch (error) {
      reportStorageError(error);
      await indexedDBStorage.setItem(name, value);
    }
  },
  async removeItem(name) {
    await indexedDBStorage.removeItem(name);
    removeLegacy(name);
  },
} satisfies StateStorage;
