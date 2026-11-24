import { get, set } from "idb-keyval";
import { getHeaders } from "./api";
import { currentIdentity, identityStorageKey } from "../utils/identity-storage";
import { reportStorageError } from "../utils/indexedDB-storage";
import {
  isSimulationImageUrl,
  SIMULATION_IMAGE_TYPES,
} from "../utils/python-stream";
import { staticSvg } from "../utils/svg-export";

const imageTypes = new Set<string>(Object.values(SIMULATION_IMAGE_TYPES));
const pending = new Map<string, Promise<Blob>>();
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

async function fetchImage(url: string, owner: string, cacheKey: string) {
  try {
    const cached = await get<Blob>(cacheKey);
    if (currentIdentity() !== owner) throw new Error("身份已切换。");
    if (cached instanceof Blob && imageTypes.has(cached.type)) return cached;
  } catch {
    // The live image is usable even if browser storage is unavailable.
  }
  if (currentIdentity() !== owner) throw new Error("身份已切换。");
  const response = await fetch(url, {
    headers: getHeaders(true),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 404)
      throw new Error("云端仿真图片已过期，请重新生成。");
    if (response.status === 401 || response.status === 403)
      throw new Error("当前身份无法读取此仿真图片。");
    throw new Error("仿真图片加载失败，请重试。");
  }
  const type = response.headers.get("Content-Type")?.split(";", 1)[0] ?? "";
  if (!response.body || !imageTypes.has(type))
    throw new Error("仿真服务未返回有效的图片。");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMAGE_BYTES) throw new Error("仿真图片超过 20 MiB。");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  let image = new Blob(chunks, { type });
  if (type === "image/svg+xml")
    image = new Blob([staticSvg(await image.text())], { type });
  if (currentIdentity() !== owner) throw new Error("身份已切换。");
  // Containers expire upstream. Preserve displayed images alongside this identity.
  await set(cacheKey, image).catch(reportStorageError);
  return image;
}

export function loadSimulationImage(url: string) {
  const owner = currentIdentity();
  if (owner === "locked" || !isSimulationImageUrl(url))
    return Promise.reject(new Error("请先登录后读取仿真图片。"));
  const key = identityStorageKey("simulation-image:" + url, owner);
  let task = pending.get(key);
  if (!task) {
    task = fetchImage(url, owner, key).finally(() => pending.delete(key));
    pending.set(key, task);
  }
  return task;
}
