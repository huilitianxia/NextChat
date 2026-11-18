/** @jest-environment node */
import { jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
jest.unstable_mockModule("server-only", () => ({}));
const { getFriendAccessConfig, matchFriendProfile, identityIdForCode } =
  await import("../app/config/friend-profiles");
const { USER_ROSTER, DEFAULT_FRIEND_PASSWORD_HASHES } = await import(
  "../app/config/user-profiles"
);
const { POST: health } = await import("../app/api/health-check/route");
const { POST: verify } = await import("../app/api/auth/verify/route");
const { auth } = await import("../app/api/auth");
const { ModelProvider } = await import("../app/constant");
const originalEnv = { ...process.env },
  originalFetch = global.fetch;
const originalHashes = { ...DEFAULT_FRIEND_PASSWORD_HASHES };
const testPassword = "test-only-random-password";
beforeEach(() => {
  for (const user of USER_ROSTER) delete process.env[user.passwordEnv];
  delete process.env.FRIEND_PROFILES;
  delete process.env.CODE;
  delete process.env.IDENTITY_SECRET;
  delete process.env.IMAGE_EDIT_FALLBACK_MODEL;
  process.env.OPENAI_API_KEY = "server-only-test-key";
  process.env.BASE_URL = "https://upstream.test/v1";
  process.env.CUSTOM_MODELS = "-all,+gpt-6.2-sol";
  Object.assign(DEFAULT_FRIEND_PASSWORD_HASHES, originalHashes);
  // Synthetic test credential avoids placing the real handout in source control.
  DEFAULT_FRIEND_PASSWORD_HASHES.qikai = createHash("sha256")
    .update(testPassword)
    .digest("hex");
  global.fetch = jest.fn<typeof fetch>();
});
afterEach(() => Object.assign(DEFAULT_FRIEND_PASSWORD_HASHES, originalHashes));
afterAll(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});
function req(password = testPassword) {
  return new NextRequest("https://app.test/api/health-check", {
    method: "POST",
    headers: { "x-nextchat-access-code": encodeURIComponent(password) },
  });
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const goodFetch = async (input: any, init: any) => {
  const path = String(input);
  expect(new Headers(init.headers).get("authorization")).toBe(
    "Bearer server-only-test-key",
  );
  expect(new Headers(init.headers).has("x-nextchat-access-code")).toBe(false);
  if (path.endsWith("chat/completions"))
    return json({ choices: [{ message: { content: "OK" } }] });
  if (path.endsWith("responses"))
    return json({ output: [{ type: "web_search_call", status: "completed" }] });
  if (path.endsWith("audio/transcriptions")) return json({ text: "" });
  return json({ data: [{ b64_json: "aGVhbHRoLWNoZWNrLWltYWdl" }] });
};
async function results() {
  const response = await health(req());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events.at(-1).type).toBe("done");
  return events
    .filter((event) => event.type === "result")
    .map((event) => event.result);
}

test("only the four new users have SHA-256 defaults; hashes themselves cannot log in", async () => {
  expect(Object.keys(originalHashes).sort()).toEqual([
    "biaozi",
    "jc",
    "qikai",
    "ziwei",
  ]);
  for (const hash of Object.values(originalHashes))
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    await matchFriendProfile(DEFAULT_FRIEND_PASSWORD_HASHES.qikai),
  ).toBeNull();
  expect(await matchFriendProfile("")).toBeNull();
  const response = await verify(
    new NextRequest("https://app.test/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: testPassword }),
    }),
  );
  expect(await response.json()).toMatchObject({
    name: "琦凯",
    major: "ee",
    identityId: expect.stringMatching(/^[a-f0-9]{40}$/),
  });
  expect((await auth(req(), ModelProvider.GPT)).error).toBe(false);
});
test.each(["FRIEND_PROFILES", "FRIEND_PASSWORD_QIKAI"])(
  "%s revokes the default password while retaining other accounts",
  async (variable) => {
    process.env[variable] =
      variable === "FRIEND_PROFILES"
        ? JSON.stringify({
            override: { name: "琦凯", greeting: "welcome", badge: "custom" },
          })
        : "override";
    expect(await matchFriendProfile(testPassword)).toBeNull();
    expect((await matchFriendProfile("override"))?.name).toBe("琦凯");
    expect(getFriendAccessConfig().passwordHashes.size).toBe(3);
  },
);
test("fallback identity stays stable across provider key, other passwords, and mapping order changes", async () => {
  const first = await identityIdForCode(testPassword);
  process.env.OPENAI_API_KEY = "rotated-key";
  process.env.FRIEND_PROFILES = JSON.stringify({
    extra: { name: "严", greeting: "hi", badge: "chem" },
  });
  process.env.CODE = "added-code";
  expect(await identityIdForCode(testPassword)).toBe(first);
  process.env.IDENTITY_SECRET = "explicit-stable-secret";
  expect(await identityIdForCode(testPassword)).not.toBe(first);
});
test("health check rejects unauthenticated requests before contacting upstream", async () => {
  expect((await health(req("wrong"))).status).toBe(401);
  expect(global.fetch).not.toHaveBeenCalled();
});
test("health check probes all four actual endpoints with bounded synthetic inputs", async () => {
  (global.fetch as jest.Mock<typeof fetch>).mockImplementation(goodFetch);
  const checks = await results();
  expect(checks).toHaveLength(4);
  expect(checks.every((result) => result.status === "ok")).toBe(true);
  const calls = (global.fetch as jest.Mock<typeof fetch>).mock.calls;
  expect(calls).toHaveLength(4);
  const search = calls.find(([url]) => String(url).endsWith("responses"))!;
  expect(JSON.parse(String(search[1]?.body))).toMatchObject({
    model: "gpt-6.2-sol",
    tools: [{ type: "web_search" }],
    tool_choice: "required",
    store: false,
    reasoning: { effort: "low" },
    max_output_tokens: 1024,
  });
  const chat = calls.find(([url]) => String(url).endsWith("chat/completions"))!;
  expect(JSON.parse(String(chat[1]?.body))).toMatchObject({
    model: "gpt-6.2-sol",
    reasoning_effort: "low",
  });
  expect(checks.find((result) => result.id === "chat")?.model).toBe(
    "gpt-6.2-sol",
  );
  const audio = calls.find(([url]) =>
    String(url).endsWith("audio/transcriptions"),
  )![1]?.body as FormData;
  expect((audio.get("file") as Blob).size).toBe(32044);
  expect(audio.get("model")).toBe("whisper-1");
  const image = calls.find(([url]) => String(url).endsWith("images/edits"))![1]
    ?.body as FormData;
  expect(image.get("quality")).toBe("low");
  expect(image.get("model")).toBe("gpt-image-2.6-sunburst");
});
test("HTTP success without an actual search call is reported as a failed search", async () => {
  (global.fetch as jest.Mock<typeof fetch>).mockImplementation(
    async (input, init) =>
      String(input).endsWith("responses")
        ? json({ output: [{ type: "message" }] })
        : goodFetch(input, init),
  );
  const checks = await results();
  expect(checks.find((result) => result.id === "search")).toMatchObject({
    status: "error",
    message: expect.stringContaining("未确认执行"),
  });
  expect(checks.filter((result) => result.status === "ok")).toHaveLength(3);
});
test("unsupported image primary uses fallback and reports the effective model", async () => {
  (global.fetch as jest.Mock<typeof fetch>).mockImplementation(
    async (input, init) => {
      if (
        String(input).endsWith("images/edits") &&
        (init?.body as FormData).get("model") === "gpt-image-2.6-sunburst"
      )
        return json({ error: { code: "model_not_found" } }, 404);
      return goodFetch(input, init);
    },
  );
  expect(
    (await results()).find((result) => result.id === "image"),
  ).toMatchObject({ status: "fallback", model: "gpt-image-2.5-flare" });
  expect(global.fetch).toHaveBeenCalledTimes(5);
});
test.each([401, 429])(
  "image HTTP %s does not trigger fallback or leak upstream errors",
  async (status) => {
    (global.fetch as jest.Mock<typeof fetch>).mockImplementation(
      async (input, init) =>
        String(input).endsWith("images/edits")
          ? json({ error: { message: "SECRET-provider-key" } }, status)
          : goodFetch(input, init),
    );
    const checks = await results();
    expect(checks.find((result) => result.id === "image")).toMatchObject({
      status: "error",
      httpStatus: status,
    });
    expect(JSON.stringify(checks)).not.toContain("SECRET");
    expect(global.fetch).toHaveBeenCalledTimes(4);
  },
);
test("chat whitelist applies to chat/search probes while independent probes still finish", async () => {
  process.env.CUSTOM_MODELS = "-all,+other-model";
  (global.fetch as jest.Mock<typeof fetch>).mockImplementation(goodFetch);
  const checks = await results();
  expect(
    checks
      .filter((result) => result.status === "error")
      .map((result) => result.id)
      .sort(),
  ).toEqual(["chat", "search"]);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
