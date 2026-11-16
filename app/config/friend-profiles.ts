import "server-only";
import {
  USER_ROSTER,
  majorForName,
  Major,
  MAJOR_LABELS,
  DEFAULT_FRIEND_PASSWORD_HASHES,
} from "./user-profiles";

export type FriendProfile = {
  name: string;
  greeting: string;
  badge: string;
  major?: Major;
  identityId?: string;
};

export const DEFAULT_FRIEND_PROFILE: FriendProfile = {
  name: "朋友",
  greeting: "欢迎来到你的专属空间。有什么想法，尽管聊聊。",
  badge: "专属访客",
};

export const MAX_ACCESS_CODE_LENGTH = 256;

type AccessConfig = {
  valid: boolean;
  required: boolean;
  profiles: Map<string, FriendProfile>;
  codes: Set<string>;
  passwordHashes: Map<string, FriendProfile>;
};

// Never include this server-only configuration in client props.
export function getFriendAccessConfig(
  rawProfiles = process.env.FRIEND_PROFILES,
  rawCodes = process.env.CODE,
): AccessConfig {
  const profiles = new Map<string, FriendProfile>();
  const passwordHashes = new Map<string, FriendProfile>();
  const codes = new Set(
    (rawCodes ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean),
  );
  const invalid = (): AccessConfig => ({
    valid: false,
    required: true,
    profiles: new Map(),
    codes: new Set(),
    passwordHashes: new Map(),
  });
  if (Array.from(codes).some((code) => code.length > MAX_ACCESS_CODE_LENGTH)) {
    return invalid();
  }
  if (rawProfiles?.trim()) {
    try {
      if (rawProfiles.length > 65536) return invalid();
      const parsed: unknown = JSON.parse(rawProfiles);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return invalid();
      }
      for (const [code, value] of Object.entries(parsed)) {
        if (
          !code.trim() ||
          code !== code.trim() ||
          code.length > MAX_ACCESS_CODE_LENGTH ||
          !value ||
          typeof value !== "object" ||
          Array.isArray(value)
        ) {
          return invalid();
        }
        const profile = value as Record<string, unknown>;
        for (const [key, limit] of [
          ["name", 80],
          ["greeting", 2000],
          ["badge", 80],
        ] as const) {
          const field = profile[key];
          if (
            typeof field !== "string" ||
            !field.trim() ||
            field.length > limit
          ) {
            return invalid();
          }
        }
        profiles.set(code, {
          name: profile.name as string,
          greeting: profile.greeting as string,
          badge: profile.badge as string,
          major: Object.keys(MAJOR_LABELS).includes(String(profile.major))
            ? (profile.major as Major)
            : majorForName(profile.name as string),
        });
      }
    } catch {
      // A typo must never turn a private deployment into an open relay.
      return invalid();
    }
  }
  // Optional server-only password slots extend, never replace, existing JSON mappings.
  for (const user of USER_ROSTER) {
    const password = process.env[user.passwordEnv]?.trim();
    if (!password) continue;
    if (password.length > MAX_ACCESS_CODE_LENGTH) return invalid();
    const existing = profiles.get(password);
    if (existing && existing.name !== user.name) return invalid();
    if (!existing)
      profiles.set(password, {
        name: user.name,
        major: user.major,
        greeting: "欢迎回来，今天也一起把难题拆开。",
        badge: `${MAJOR_LABELS[user.major]} · 专属空间`,
      });
  }
  // An explicit mapping for a roster member revokes their built-in password.
  const configuredNames = new Set(Array.from(profiles.values(), (p) => p.name));
  for (const user of USER_ROSTER) {
    const hash = DEFAULT_FRIEND_PASSWORD_HASHES[user.id];
    if (!hash || configuredNames.has(user.name)) continue;
    passwordHashes.set(hash, {
      name: user.name,
      major: user.major,
      greeting: "欢迎回来，今天也一起把难题拆开。",
      badge: `${MAJOR_LABELS[user.major]} · 专属空间`,
    });
  }
  return {
    valid: true,
    required: codes.size > 0 || profiles.size > 0 || passwordHashes.size > 0,
    profiles,
    codes,
    passwordHashes,
  };
}

export async function identityIdForCode(code: string): Promise<string> {
  if (!code.trim()) return "public";
  // This namespaces local browser data; it is not a session/token signing key.
  // Never derive it from provider keys or password mappings, which can rotate.
  const secret = process.env.IDENTITY_SECRET || "nextchat-campus-identity-v1";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`nextchat-identity:${code.trim()}`),
    ),
  );
  return Array.from(bytes.slice(0, 20), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function matchFriendProfile(
  code: string,
  config = getFriendAccessConfig(),
): Promise<FriendProfile | null> {
  if (!config.valid || code.length > MAX_ACCESS_CODE_LENGTH) return null;
  const normalized = code.trim();
  const friend = config.profiles.get(normalized);
  if (friend) return { ...friend };
  if (normalized && config.passwordHashes.size) {
    const bytes = new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(normalized),
      ),
    );
    const hash = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const hashedFriend = config.passwordHashes.get(hash);
    if (hashedFriend) return { ...hashedFriend };
  }
  if (config.codes.has(normalized) || !config.required) {
    return { ...DEFAULT_FRIEND_PROFILE };
  }
  return null;
}
