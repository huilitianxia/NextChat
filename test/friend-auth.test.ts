/** @jest-environment node */
import { jest } from "@jest/globals";
import { NextRequest } from "next/server";

jest.unstable_mockModule("server-only", () => ({}));

const { getFriendAccessConfig, matchFriendProfile } = await import(
  "../app/config/friend-profiles"
);
const { POST } = await import("../app/api/auth/verify/route");
const { auth } = await import("../app/api/auth");
const { ModelProvider } = await import("../app/constant");

const originalEnv = { ...process.env };
const wang = {
  name: "老王",
  greeting: "老王专属通道已开启",
  badge: "VIP 体验官",
};
const li = { name: "小李", greeting: "仅小李可见", badge: "朋友" };

beforeEach(() => {
  process.env.FRIEND_PROFILES = JSON.stringify({
    "wang-secret": wang,
    "li-secret": li,
  });
  process.env.CODE = "legacy-one, legacy-two";
  process.env.OPENAI_API_KEY = "sk-test-server-only";
});
afterAll(() => {
  process.env = originalEnv;
});

function verify(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("https://example.test/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("friend identity verification", () => {
  test("returns exactly one selected profile and forbids caching", async () => {
    const response = await verify({ code: "wang-secret" });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      ...wang,
      major: "research",
      identityId: expect.stringMatching(/^[a-f0-9]{40}$/),
    });
    expect(Object.keys(result).sort()).toEqual([
      "badge",
      "greeting",
      "identityId",
      "major",
      "name",
    ]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  test("original comma-separated CODE and profiles coexist", async () => {
    expect((await verify({ code: "legacy-two" })).status).toBe(200);
    expect((await verify({ code: "li-secret" })).status).toBe(200);
    expect((await verify({ code: "wrong" })).status).toBe(401);
    expect((await verify({ code: "" })).status).toBe(401);
  });

  test("friend metadata takes precedence over a matching legacy CODE", async () => {
    const config = getFriendAccessConfig(
      JSON.stringify({ overlap: wang }),
      "overlap",
    );
    expect(await matchFriendProfile("overlap", config)).toEqual({
      ...wang,
      major: "research",
    });
  });

  test.each([
    "{broken",
    "[]",
    "null",
    '{"password":null}',
    '{"password":{"name":"Only name"}}',
  ])(
    "malformed configuration fails closed, including legacy access: %s",
    async (raw) => {
      process.env.FRIEND_PROFILES = raw;
      const config = getFriendAccessConfig();
      expect(config.required).toBe(true);
      expect(config.valid).toBe(false);
      expect((await verify({ code: "legacy-one" })).status).toBe(503);
    },
  );

  test("prototype property names cannot grant access", async () => {
    expect((await verify({ code: "__proto__" })).status).toBe(401);
    expect((await verify({ code: "constructor" })).status).toBe(401);
  });

  test("built-in accounts keep a zero-config deployment private", async () => {
    delete process.env.CODE;
    delete process.env.FRIEND_PROFILES;
    expect((await verify({ code: "" })).status).toBe(401);
  });

  test.each(
    [null, [], {}, { code: [] }, { code: 123 }, { code: "x".repeat(257) }].map(
      (body) => [body],
    ),
  )("rejects malformed request data", async (body) => {
    expect((await verify(body)).status).toBe(400);
  });

  test("bounds real request bytes even without a content-length header", async () => {
    expect((await verify({ code: "x".repeat(5000) })).status).toBe(413);
    expect(
      (await verify({ code: "wang-secret" }, { "content-length": "9000" }))
        .status,
    ).toBe(413);
    expect(
      (await verify({ code: "wang-secret" }, { "content-type": "text/plain" }))
        .status,
    ).toBe(415);
  });
});

describe("model request authorization", () => {
  function request(headers: Record<string, string>) {
    return new NextRequest(
      "https://example.test/api/openai/v1/chat/completions",
      { headers },
    );
  }

  test("validates the same friend code and injects only the server key", async () => {
    const req = request({ "x-nextchat-access-code": "wang-secret" });
    expect((await auth(req, ModelProvider.GPT)).error).toBe(false);
    expect(req.headers.get("authorization")).toBe("Bearer sk-test-server-only");
    expect(req.headers.has("x-nextchat-access-code")).toBe(false);
  });

  test("retains legacy nk-code access and supports Unicode friend passwords", async () => {
    expect(
      (
        await auth(
          request({ authorization: "Bearer nk-legacy-one" }),
          ModelProvider.GPT,
        )
      ).error,
    ).toBe(false);
    process.env.FRIEND_PROFILES = JSON.stringify({ 朋友密码: wang });
    expect(
      (
        await auth(
          request({ "x-nextchat-access-code": encodeURIComponent("朋友密码") }),
          ModelProvider.GPT,
        )
      ).error,
    ).toBe(false);
  });

  test("stored profiles cannot bypass revoked access codes", async () => {
    process.env.FRIEND_PROFILES = JSON.stringify({ "new-code": wang });
    expect(
      (
        await auth(
          request({ "x-nextchat-access-code": "wang-secret" }),
          ModelProvider.GPT,
        )
      ).error,
    ).toBe(true);
    expect((await auth(request({}), ModelProvider.GPT)).error).toBe(true);
  });

  test.each<Record<string, string>>([
    { authorization: "Bearer sk-browser-key" },
    { "api-key": "sk-browser-key", "x-nextchat-access-code": "wang-secret" },
    { "x-api-key": "sk-browser-key", "x-nextchat-access-code": "wang-secret" },
    {
      "x-goog-api-key": "sk-browser-key",
      "x-nextchat-access-code": "wang-secret",
    },
  ])(
    "rejects supplied provider keys instead of bypassing the password",
    async (headers) => {
      expect(
        (
          await auth(
            request(headers as Record<string, string>),
            ModelProvider.GPT,
          )
        ).error,
      ).toBe(true);
    },
  );

  test("missing server key never forwards a password upstream", async () => {
    delete process.env.OPENAI_API_KEY;
    const req = request({ "x-nextchat-access-code": "wang-secret" });
    expect((await auth(req, ModelProvider.GPT)).error).toBe(true);
    expect(req.headers.has("authorization")).toBe(false);
  });
});
