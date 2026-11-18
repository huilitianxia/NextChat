/** @jest-environment node */
import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import {
  EFFORTS,
  effortPayload,
  fetchWithEffortFallback,
  normalizeEffort,
  splitReasoning,
  xhighUnsupported,
} from "../app/utils/reasoning";
jest.unstable_mockModule("server-only", () => ({}));
jest.unstable_mockModule("@/app/config/server", () => ({
  getServerSideConfig: () => ({
    baseUrl: "https://upstream.test",
    apiKey: "test-server-key",
    customModels: "-all,+gpt-6.1-sol",
  }),
}));
const { requestOpenai } = await import("../app/api/common");
const { POST: search } = await import("../app/api/search/route");
const originalFetch = global.fetch,
  originalEnv = { ...process.env };
beforeEach(() => {
  global.fetch = jest.fn<typeof fetch>();
  process.env.FRIEND_PROFILES = JSON.stringify({
    test: { name: "严", greeting: "hi", badge: "chem" },
  });
});
afterAll(() => {
  global.fetch = originalFetch;
  process.env = originalEnv;
});
const unsupported = {
  error: {
    code: "unsupported_value",
    param: "reasoning_effort",
    message:
      "Unsupported value 'xhigh' for reasoning_effort. Supported values: low, medium, high.",
  },
};
const ok = () =>
  new Response("data: [DONE]\n\n", {
    headers: { "Content-Type": "text/event-stream" },
  });
test.each(EFFORTS)("injects %s only for reasoning families", (effort) => {
  expect(effortPayload("gpt-6.1-sol", effort)).toEqual({
    reasoning_effort: effort,
  });
  expect(effortPayload("gpt-6.2-sol", effort)).toEqual({
    reasoning_effort: effort,
  });
  expect(effortPayload("o3", effort)).toEqual({ reasoning_effort: effort });
  expect(effortPayload("gpt-4o", effort)).toEqual({});
  expect(effortPayload("gpt-60", effort)).toEqual({});
});
test("invalid saved effort is balanced, and only explicit xhigh value errors qualify", () => {
  expect(normalizeEffort("max")).toBe("medium");
  expect(xhighUnsupported(400, unsupported)).toBe(true);
  for (const status of [401, 403, 404, 429, 500])
    expect(xhighUnsupported(status, unsupported)).toBe(false);
  expect(
    xhighUnsupported(400, {
      error: { code: "unsupported_value", message: "unsupported image size" },
    }),
  ).toBe(false);
});
test("chat server retries exactly once at high, preserving model/history and removing GPT-6 temperature", async () => {
  const mock = global.fetch as jest.Mock<typeof fetch>;
  mock
    .mockResolvedValueOnce(
      new Response(JSON.stringify(unsupported), { status: 400 }),
    )
    .mockResolvedValueOnce(ok());
  const response = await requestOpenai(
    new NextRequest("https://app.test/api/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer test-server-key" },
      body: JSON.stringify({
        model: "gpt-6.1-sol",
        temperature: 0.7,
        reasoning_effort: "xhigh",
        messages: [{ role: "user", content: "derive" }],
        stream: true,
      }),
    }),
  );
  expect(mock).toHaveBeenCalledTimes(2);
  const bodies = mock.mock.calls.map((call) =>
    JSON.parse(String(call[1]?.body)),
  );
  expect(bodies.map((body) => body.reasoning_effort)).toEqual([
    "xhigh",
    "high",
  ]);
  expect(bodies[1].messages).toEqual(bodies[0].messages);
  expect(bodies[1].model).toBe("gpt-6.1-sol");
  expect(bodies[0]).not.toHaveProperty("temperature");
  expect(response.headers.get("x-nextchat-reasoning-effort")).toBe("high");
  expect(response.headers.get("x-nextchat-reasoning-fallback")).toBe("true");
});
test.each(EFFORTS)(
  "authenticated search forwards %s to Responses reasoning.effort",
  async (effort) => {
    const mock = global.fetch as jest.Mock<typeof fetch>;
    mock.mockResolvedValueOnce(ok());
    const response = await search(
      new NextRequest("https://app.test/api/search", {
        method: "POST",
        headers: {
          "x-nextchat-access-code": "test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-6.1-sol",
          reasoning_effort: effort,
          messages: [{ role: "user", content: "Find a source" }],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(String(mock.mock.calls[0][1]?.body))).toMatchObject({
      reasoning: { effort },
      tools: [{ type: "web_search" }],
      stream: true,
    });
  },
);
test("Responses uses the same xhigh fallback and metadata", async () => {
  const mock = global.fetch as jest.Mock<typeof fetch>;
  mock
    .mockResolvedValueOnce(
      new Response(JSON.stringify(unsupported), { status: 422 }),
    )
    .mockResolvedValueOnce(ok());
  const response = await search(
    new NextRequest("https://app.test/api/search", {
      method: "POST",
      headers: {
        "x-nextchat-access-code": "test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6.1-sol",
        reasoning_effort: "xhigh",
        messages: [{ role: "user", content: "source" }],
      }),
    }),
  );
  expect(
    mock.mock.calls.map(
      (call) => JSON.parse(String(call[1]?.body)).reasoning.effort,
    ),
  ).toEqual(["xhigh", "high"]);
  expect(response.headers.get("x-nextchat-reasoning-fallback")).toBe("true");
});
test.each([401, 429, 500])(
  "HTTP %s never downgrades effort",
  async (status) => {
    const mock = global.fetch as jest.Mock<typeof fetch>;
    mock.mockResolvedValue(
      new Response(JSON.stringify(unsupported), { status }),
    );
    const result = await fetchWithEffortFallback(
      "https://upstream.test",
      { method: "POST" },
      { model: "gpt-6.1-sol", reasoning_effort: "xhigh" },
    );
    expect(result.fallback).toBe(false);
    expect(mock).toHaveBeenCalledTimes(1);
  },
);
test("thinking tags are separated, including streamed tags, while fenced examples stay intact", () => {
  expect(splitReasoning("<think>检查单位</think>答案")).toEqual({
    reasoning: "检查单位",
    answer: "答案",
    thinking: false,
  });
  expect(splitReasoning("<think>尚未完成").thinking).toBe(true);
  expect(splitReasoning("<thin").answer).toBe("");
  expect(splitReasoning("```html\n<think>example</think>\n```").reasoning).toBe(
    "",
  );
});
test("inline code containing a think tag is kept as an example", () => {
  expect(splitReasoning("使用 `<think>` 标签示例").answer).toBe(
    "使用 `<think>` 标签示例",
  );
});
