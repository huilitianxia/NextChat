import type { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;
const buckets = new Map<string, { used: number; expires: number }>();

export function retryAfter(request: NextRequest, now = Date.now()) {
  const path = request.nextUrl.pathname;
  const group = path.startsWith("/api/auth/")
    ? "auth"
    : request.method === "GET" || request.method === "HEAD"
    ? "read"
    : "write";
  const limit = { auth: 12, read: 120, write: 40 }[group];
  const trustedIp =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for") ||
        request.headers.get("x-forwarded-for")
      : request.ip;
  const candidate = trustedIp?.split(",", 1)[0].trim();
  const ip =
    candidate && /^[a-f\d.:]{3,45}$/i.test(candidate) ? candidate : "local";
  const key = group + ":" + ip;
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.expires) {
    if (!bucket && buckets.size >= MAX_KEYS) {
      for (const [id, entry] of buckets) {
        if (now >= entry.expires) buckets.delete(id);
      }
      if (buckets.size >= MAX_KEYS) return 1;
    }
    bucket = { used: 0, expires: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  if (bucket.used >= limit) return Math.ceil((bucket.expires - now) / 1000);
  bucket.used++;
  return 0;
}
