import "server-only";

export type FriendProfile = {
  name: string;
  greeting: string;
  badge: string;
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
};

// Never include this server-only configuration in client props.
export function getFriendAccessConfig(
  rawProfiles = process.env.FRIEND_PROFILES,
  rawCodes = process.env.CODE,
): AccessConfig {
  const profiles = new Map<string, FriendProfile>();
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
        });
      }
    } catch {
      // A typo must never turn a private deployment into an open relay.
      return invalid();
    }
  }
  return {
    valid: true,
    required: codes.size > 0 || profiles.size > 0,
    profiles,
    codes,
  };
}

export function matchFriendProfile(
  code: string,
  config = getFriendAccessConfig(),
): FriendProfile | null {
  if (!config.valid || code.length > MAX_ACCESS_CODE_LENGTH) return null;
  const normalized = code.trim();
  const friend = config.profiles.get(normalized);
  if (friend) return { ...friend };
  if (config.codes.has(normalized) || !config.required) {
    return { ...DEFAULT_FRIEND_PROFILE };
  }
  return null;
}
