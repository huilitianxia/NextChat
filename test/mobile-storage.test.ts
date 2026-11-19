import { jest } from "@jest/globals";

const database = new Map<string, string>();
const get = jest.fn(async (key: string) => database.get(key));
const set = jest.fn(async (key: string, value: string) => {
  database.set(key, value);
});
const del = jest.fn(async (key: string) => {
  database.delete(key);
});
jest.unstable_mockModule("idb-keyval", () => ({ get, set, del }));

const {
  indexedDBStorage,
  lightweightStorage,
  readLocalRecord,
  writeLocalRecord,
  STORAGE_ERROR_EVENT,
  STORAGE_FULL_MESSAGE,
} = await import("../app/utils/indexedDB-storage");

beforeEach(() => {
  localStorage.clear();
  database.clear();
  set.mockClear();
});

test("copies a legacy draft first and removes only that successful legacy copy", async () => {
  localStorage.setItem("draft-a", "待发送草稿");
  localStorage.setItem("draft-b", "另一个会话");
  expect(await readLocalRecord("draft-a")).toBe("待发送草稿");
  expect(database.get("draft-a")).toBe("待发送草稿");
  expect(localStorage.getItem("draft-a")).toBeNull();
  expect(localStorage.getItem("draft-b")).toBe("另一个会话");
});

test("clearing a draft during restoration cannot resurrect the legacy copy", async () => {
  localStorage.setItem("draft", "旧正文");
  const clearing = writeLocalRecord("draft", null);
  const restored = await readLocalRecord("draft");
  await clearing;
  expect(restored).toBeNull();
  expect(database.has("draft")).toBe(false);
});

test("keeps legacy data when IndexedDB quota is exceeded and never writes heavy data back to localStorage", async () => {
  const onError = jest.fn();
  window.addEventListener(STORAGE_ERROR_EVENT, onError);
  const full = new DOMException("Full", "QuotaExceededError");
  localStorage.setItem("chat", "legacy");
  set.mockRejectedValueOnce(full);
  expect(await readLocalRecord("chat")).toBe("legacy");
  expect(localStorage.getItem("chat")).toBe("legacy");
  set.mockRejectedValueOnce(full);
  await indexedDBStorage.setItem(
    "chat",
    JSON.stringify({ state: { _hasHydrated: true, sessions: ["new"] } }),
  );
  expect(localStorage.getItem("chat")).toBe("legacy");
  expect((onError.mock.calls[0][0] as CustomEvent<string>).detail).toBe(
    STORAGE_FULL_MESSAGE,
  );
  window.removeEventListener(STORAGE_ERROR_EVENT, onError);
});

test("moves an existing light access record to localStorage for reload", async () => {
  const access = JSON.stringify({
    state: { _hasHydrated: true, accessCode: "fixture" },
  });
  database.set("access", access);
  expect(await lightweightStorage.getItem("access")).toBe(access);
  expect(localStorage.getItem("access")).toBe(access);
  expect(database.has("access")).toBe(false);
});
