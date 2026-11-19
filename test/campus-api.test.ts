/** @jest-environment node */
import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
jest.unstable_mockModule("server-only", () => ({}));
const { POST: transcribe } = await import("../app/api/transcribe/route");
const { POST: search } = await import("../app/api/search/route");
const { POST: timedSearch } = await import("../app/api/search/deadline/route");
const { POST: imageEdit } = await import("../app/api/image-edit/route");
const { identityIdForCode, getFriendAccessConfig, matchFriendProfile } =
  await import("../app/config/friend-profiles");
const { USER_ROSTER } = await import("../app/config/user-profiles");
const originalEnv = { ...process.env },
  originalFetch = global.fetch;
beforeEach(() => {
  process.env.FRIEND_PROFILES = JSON.stringify({
    "qa-password": { name: "严", greeting: "hello", badge: "chem" },
  });
  process.env.OPENAI_API_KEY = "qa-server-key";
  process.env.BASE_URL = "https://upstream.test/v1";
  process.env.CUSTOM_MODELS = "-all,+gpt-6.1-sol";
  process.env.CODE = "";
  global.fetch = jest.fn() as typeof fetch;
});
afterAll(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});
afterEach(() => jest.useRealTimers());
function request(
  path: string,
  body: BodyInit,
  authorized = true,
  json = false,
) {
  return new NextRequest(`https://app.test/api/${path}`, {
    method: "POST",
    headers: {
      ...(authorized ? { "x-nextchat-access-code": "qa-password" } : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });
}
const audio = () => {
  const form = new FormData();
  form.set("file", new Blob(["RIFF"], { type: "audio/wav" }), "lecture.wav");
  return form;
};
const picture = () => {
  const form = new FormData();
  form.set("image", new Blob(["png"], { type: "image/png" }), "original.png");
  form.set("mask", new Blob(["mask"], { type: "image/png" }), "mask.png");
  form.set("prompt", "调整黄昏光照，保留构图");
  return form;
};
const searchRequest = () =>
  request(
    "search",
    JSON.stringify({
      model: "gpt-6.1-sol",
      messages: [{ role: "user", content: "找公开资料" }],
    }),
    true,
    true,
  );

test("an acknowledged but stalled search falls back after eight seconds", async () => {
  jest.useFakeTimers();
  let signal: AbortSignal | undefined;
  (global.fetch as jest.Mock<typeof fetch>).mockImplementation(
    async (_url, init) => {
      signal = init?.signal || undefined;
      return new Response(
        new ReadableStream({
          start(output) {
            output.enqueue(
              new TextEncoder().encode('data: {"type":"response.created"}\n\n'),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  );
  const response = timedSearch(searchRequest());
  await jest.advanceTimersByTimeAsync(7999);
  expect(signal?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect((await response).status).toBe(409);
  expect(await (await response).json()).toMatchObject({ fallback: true });
  expect(signal?.aborted).toBe(true);
});

test("a ready search forwards the original SSE bytes with an adapted Edge request", async () => {
  const stream = [
    'data: {"type":"response.created"}\r\n\r\n',
    'data: {"type":"response.web_search_call.completed"}\n\n',
    'data: {"type":"response.output_text.delta","delta":"结果"}\n\n',
    'data: {"type":"response.completed"}\n\n',
  ].join("");
  (global.fetch as jest.Mock<typeof fetch>).mockResolvedValue(
    new Response(stream, { headers: { "Content-Type": "text/event-stream" } }),
  );
  const original = searchRequest();
  const requestShape = {
    url: original.url,
    method: original.method,
    headers: original.headers,
    body: original.body,
    signal: original.signal,
  } as NextRequest;
  const response = await timedSearch(requestShape);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(stream);
});

test("the search deadline preserves authorization and falls back on 503", async () => {
  expect((await timedSearch(request("search", "{}", false, true))).status).toBe(
    401,
  );
  expect(global.fetch).not.toHaveBeenCalled();
  (global.fetch as jest.Mock<typeof fetch>).mockResolvedValue(
    Response.json({}, { status: 503 }),
  );
  expect((await timedSearch(searchRequest())).status).toBe(409);
});
test("all new routes authenticate before forwarding", async () => {
  for (const [route, body] of [
    [transcribe, audio()],
    [imageEdit, picture()],
    [search, "{}"],
  ] as const) {
    const response = await route(request("test", body, false));
    expect(response.status).toBe(401);
  }
  expect(global.fetch).not.toHaveBeenCalled();
});
test("audio forwarding fixes whisper-1 and uses only the server key", async () => {
  (global.fetch as jest.Mock<any>).mockResolvedValue(
    Response.json({ text: "课堂重点" }),
  );
  const response = await transcribe(request("transcribe", audio()));
  expect(await response.json()).toEqual({ text: "课堂重点" });
  const [url, options] = (
    (global.fetch as jest.Mock<any>).mock.calls as any[][]
  )[0];
  expect(url).toBe("https://upstream.test/v1/audio/transcriptions");
  expect(options.headers.get("Authorization")).toBe("Bearer qa-server-key");
  expect(options.headers.has("x-nextchat-access-code")).toBe(false);
  expect(options.body.get("model")).toBe("whisper-1");
});
test("oversize input is rejected before forwarding", async () => {
  const req = request("transcribe", audio());
  req.headers.set("content-length", String(4 * 1024 * 1024 + 1));
  expect((await transcribe(req)).status).toBe(413);
  expect(global.fetch).not.toHaveBeenCalled();
});
test("web search preserves whitelist and exposes a clear compatibility fallback", async () => {
  const data = {
    model: "gpt-6.1-sol",
    messages: [{ role: "user", content: "找公开资料" }],
  };
  expect(
    (
      await search(
        request(
          "search",
          JSON.stringify({ ...data, model: "forbidden" }),
          true,
          true,
        ),
      )
    ).status,
  ).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
  (global.fetch as jest.Mock<any>).mockResolvedValue(
    Response.json(
      {
        error: {
          code: "unsupported_parameter",
          message: "web_search not supported",
        },
      },
      { status: 400 },
    ),
  );
  const response = await search(
    request("search", JSON.stringify(data), true, true),
  );
  expect(response.status).toBe(409);
  expect((await response.json()).fallback).toBe(true);
  const payload = JSON.parse(
    ((global.fetch as jest.Mock<any>).mock.calls as any[][])[0][1].body,
  );
  expect(payload.tools).toEqual([{ type: "web_search" }]);
  expect(payload.model).toBe("gpt-6.1-sol");
  expect(payload.store).toBe(false);
});
test("policy and authentication failures do not trigger fallback", async () => {
  (global.fetch as jest.Mock<any>).mockResolvedValue(
    Response.json(
      { error: { code: "content_policy_violation" } },
      { status: 403 },
    ),
  );
  const response = await imageEdit(request("image-edit", picture()));
  expect(await response.text()).toContain('"type":"error"');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
test("image editing forwards the original and mask and reports the actual fallback model", async () => {
  (global.fetch as jest.Mock<any>)
    .mockResolvedValueOnce(
      Response.json({ error: { code: "model_not_found" } }, { status: 404 }),
    )
    .mockResolvedValueOnce(Response.json({ data: [{ b64_json: "aW1hZ2U=" }] }));
  const response = await imageEdit(request("image-edit", picture()));
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(events.at(-1)).toMatchObject({
    type: "result",
    model: "gpt-image-2.5-flare",
    image: "data:image/png;base64,aW1hZ2U=",
  });
  const bodies = ((global.fetch as jest.Mock<any>).mock.calls as any[][]).map(
    (call) => call[1].body,
  );
  expect(bodies[0].get("model")).toBe("gpt-image-2.6-sunburst");
  expect(await bodies[0].get("mask").text()).toBe("mask");
  expect(await bodies[1].get("image").text()).toBe("png");
});
test("roster has seven named slots without replacing existing password mappings", async () => {
  expect(USER_ROSTER).toHaveLength(7);
  process.env.FRIEND_PASSWORD_QIKAI = "qikai-password";
  expect((await matchFriendProfile("qa-password"))?.name).toBe("严");
  expect((await matchFriendProfile("qikai-password"))?.major).toBe("ee");
  process.env.FRIEND_PASSWORD_QIKAI = "qa-password";
  expect(getFriendAccessConfig().valid).toBe(false);
  delete process.env.FRIEND_PASSWORD_QIKAI;
});
test("identity keys are deterministic, distinct and do not reveal passwords", async () => {
  process.env.IDENTITY_SECRET = "stable-test-secret";
  const first = await identityIdForCode("qa-password");
  expect(first).toBe(await identityIdForCode("qa-password"));
  expect(first).not.toBe(await identityIdForCode("another-password"));
  expect(first).not.toContain("qa-password");
});
