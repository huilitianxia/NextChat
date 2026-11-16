// Logical per-identity browser partitions; no secret or password is used as a storage key.
let owner = "locked";
let changing = false;
let queue = Promise.resolve();
const stores = new Set<(id: string) => Promise<void>>();
export const currentIdentity = () => owner;
export const identityChanging = () => changing;
export const identityStorageKey = (name: string, id = owner) =>
  `nextchat:user:${id}:${name}`;
export function registerIdentityStore(switcher: (id: string) => Promise<void>) {
  stores.add(switcher);
}
export function activateIdentity(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    return Promise.reject(new Error("身份标识无效"));
  const next = queue
    .catch(() => {})
    .then(async () => {
      if (id === owner) return;
      changing = true;
      owner = id;
      try {
        for (const switcher of stores) await switcher(id);
      } catch (error) {
        owner = "locked";
        throw error;
      } finally {
        changing = false;
      }
    });
  queue = next;
  return next;
}
