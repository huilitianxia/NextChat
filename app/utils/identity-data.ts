import { keys, del } from "idb-keyval";
import { currentIdentity, identityStorageKey } from "./identity-storage";
export async function clearIdentityData(owner = currentIdentity()) {
  if (owner === "locked") throw new Error("请先登录");
  const owned = (key: string) =>
    key.startsWith(identityStorageKey("", owner)) ||
    key.startsWith(`nextchat:rag:${owner}:`);
  const storageKeys = await keys();
  await Promise.all(
    storageKeys
      .filter((key) => typeof key === "string" && owned(key))
      .map((key) => del(key)),
  );
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && owned(key)) localStorage.removeItem(key);
  }
}
