export type Major =
  | "research"
  | "medicine"
  | "chemistry"
  | "ee"
  | "architecture"
  | "cs"
  | "security";
export const MAJOR_LABELS: Record<Major, string> = {
  research: "通用科研",
  medicine: "医学",
  chemistry: "化学",
  ee: "电气",
  architecture: "建筑",
  cs: "计科",
  security: "网安",
};
export const USER_ROSTER = [
  {
    id: "yan",
    name: "严",
    major: "chemistry",
    passwordEnv: "FRIEND_PASSWORD_YAN",
  },
  {
    id: "waiting",
    name: "waiting",
    major: "medicine",
    passwordEnv: "FRIEND_PASSWORD_WAITING",
  },
  {
    id: "binhuang",
    name: "彬皇",
    major: "medicine",
    passwordEnv: "FRIEND_PASSWORD_BINHUANG",
  },
  {
    id: "qikai",
    name: "琦凯",
    major: "ee",
    passwordEnv: "FRIEND_PASSWORD_QIKAI",
  },
  {
    id: "biaozi",
    name: "镖子",
    major: "architecture",
    passwordEnv: "FRIEND_PASSWORD_BIAOZI",
  },
  { id: "jc", name: "jc", major: "cs", passwordEnv: "FRIEND_PASSWORD_JC" },
  {
    id: "ziwei",
    name: "子维",
    major: "security",
    passwordEnv: "FRIEND_PASSWORD_ZIWEI",
  },
] as const;

// SHA-256 of independent 144-bit random passwords. No plaintext defaults in git.
// View the locally generated handout: node scripts/friend-passwords.mjs --show
// Existing FRIEND_PROFILES / FRIEND_PASSWORD_* entries disable that user's default.
export const DEFAULT_FRIEND_PASSWORD_HASHES: Record<string, string> = {
  // GENERATED_PASSWORD_HASHES_START
  qikai: "7afc1b21155469c00a65fc1ce1742ac8210e95c409e85017aa5701fbbac13531",
  biaozi: "948fc4e31e02ac165b48e604d6ae024749b5bb1fe0fe5e22b60c1a4dd38010bd",
  jc: "388531a4f5f7e461f54cbc025b7152c46267648bb6b41d809fd2abd8dc3a0f9b",
  ziwei: "c1e9ef157328bf864efe335f7ceba86b27a3695a3c857aa522734fd5545c97fa",
  // GENERATED_PASSWORD_HASHES_END
};

export function majorForName(name: string): Major {
  return USER_ROSTER.find((user) => user.name === name)?.major ?? "research";
}
