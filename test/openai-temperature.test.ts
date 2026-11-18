/** @jest-environment node */

import { jest } from "@jest/globals";
import { NextRequest } from "next/server";

const config = {
  baseUrl: "https://upstream.example.test",
  azureUrl: "",
  azureApiVersion: "2023-08-01-preview",
  customModels: "",
  openaiOrgId: "",
};
jest.unstable_mockModule("@/app/config/server", () => ({
  getServerSideConfig: () => config,
}));
const { requestOpenai } = await import("../app/api/common");

const originalFetch = global.fetch;
const originalDisableGpt4 = process.env.DISABLE_GPT4;
const forwarded: Array<{
  url: string;
  body: string | null;
  init: RequestInit;
}> = [];
const upstream = jest.fn<typeof fetch>(async (input, init) => {
  // Read the actual outgoing stream/string. A consumed req.body reused by the
  // proxy fails here just as it would in a real upstream fetch.
  const body = init?.body == null ? null : await new Response(init.body).text();
  forwarded.push({ url: String(input), body, init: init ?? {} });
  return new Response('data: {"choices":[]}\n\ndata: [DONE]\n\n', {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
});

beforeEach(() => {
  config.customModels = "";
  forwarded.length = 0;
  upstream.mockClear();
  global.fetch = upstream;
  delete process.env.DISABLE_GPT4;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  global.fetch = originalFetch;
  if (originalDisableGpt4 === undefined) delete process.env.DISABLE_GPT4;
  else process.env.DISABLE_GPT4 = originalDisableGpt4;
});

function request(body?: string) {
  return new NextRequest(
    `https://chat.example.test/api/openai/v1/${
      body === undefined ? "models" : "chat/completions"
    }`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer sk-dummy-server-key",
      },
      body,
    },
  );
}

function legacyPayload(model: string) {
  return {
    model,
    temperature: 0.5,
    messages: [
      { role: "system", content: "Keep all other settings." },
      { role: "user", content: "你好" },
    ],
    stream: true,
    top_p: 0.8,
    frequency_penalty: 0.1,
    max_tokens: 512,
    metadata: { source: "old-browser" },
  };
}

describe.each([false, true])(
  "OpenAI forwarding with custom models enabled=%s",
  (withModels) => {
    function configure(model: string) {
      config.customModels = withModels ? `-all,+${model}@openai` : "";
    }

    test.each([
      "gpt-6",
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6.1-terra",
      "gpt-6-2026-11-14",
      "gpt-6.1-sol-2026-11-14",
      "gpt-6.1-terra-2026-11-14",
    ])(
      "omits unsupported temperature from the actual %s request",
      async (model) => {
        configure(model);
        const payload = legacyPayload(model);
        const req = request(JSON.stringify(payload));
        const response = await requestOpenai(req);

        expect(response.status).toBe(200);
        expect(upstream).toHaveBeenCalledTimes(1);
        expect(forwarded[0].url).toBe(
          "https://upstream.example.test/v1/chat/completions",
        );
        const sent = JSON.parse(forwarded[0].body!);
        expect(sent).not.toHaveProperty("temperature");
        const { temperature: _temperature, ...otherFields } = payload;
        expect(sent).toEqual(otherFields);
        expect(
          new Headers(forwarded[0].init.headers).get("authorization"),
        ).toBe("Bearer sk-dummy-server-key");
        // Rewriting the request must not buffer or discard the streaming response.
        expect(response.headers.get("content-type")).toBe("text/event-stream");
        expect(await response.text()).toContain("data: [DONE]");
      },
    );

    test.each(["gpt-4o", "gpt-60", "custom-gpt-6-astra"])(
      "preserves temperature for unrelated model %s",
      async (model) => {
        configure(model);
        const payload = legacyPayload(model);
        await requestOpenai(request(JSON.stringify(payload)));
        expect(upstream).toHaveBeenCalledTimes(1);
        expect(JSON.parse(forwarded[0].body!)).toEqual(payload);
      },
    );

    test.each(["gpt-6.2-sol", "gpt-6.2-sol-2026-11-18", "GPT-6.2-SOL"])(
      "omits rejected sampling fields for %s while retaining reasoning and history",
      async (model) => {
        configure(model);
        const payload = {
          ...legacyPayload(model),
          reasoning_effort: "xhigh",
          logprobs: true,
          top_logprobs: 5,
        };
        const response = await requestOpenai(request(JSON.stringify(payload)));
        expect(response.status).toBe(200);
        expect(upstream).toHaveBeenCalledTimes(1);
        const {
          temperature: _temperature,
          top_p: _topP,
          logprobs: _logprobs,
          top_logprobs: _topLogprobs,
          ...expected
        } = payload;
        expect(JSON.parse(forwarded[0].body!)).toEqual(expected);
        expect(await response.text()).toContain("data: [DONE]");
      },
    );

    test("does not add temperature when an updated client already omitted it", async () => {
      configure("gpt-6.1-sol");
      const payload = { model: "gpt-6.1-sol", messages: [], stream: false };
      await requestOpenai(request(JSON.stringify(payload)));
      expect(JSON.parse(forwarded[0].body!)).toEqual(payload);
    });

    test("preserves a bodyless model-list GET", async () => {
      configure("gpt-6.1-sol");
      const response = await requestOpenai(request());
      expect(response.status).toBe(200);
      expect(forwarded).toHaveLength(1);
      expect(forwarded[0].url).toBe("https://upstream.example.test/v1/models");
      expect(forwarded[0].body).toBeNull();
      expect(forwarded[0].init.method).toBe("GET");
    });

    test("keeps malformed JSON pass-through behavior without reusing a consumed stream", async () => {
      configure("gpt-6.1-sol");
      const malformed = '{"model":"gpt-6.1-sol","temperature":0.5,invalid';
      const response = await requestOpenai(request(malformed));
      expect(response.status).toBe(200);
      expect(forwarded).toHaveLength(1);
      expect(forwarded[0].body).toBe(malformed);
    });
  },
);

test.each(["gpt-6.1-sol", "gpt-6.2-sol"])(
  "parameter normalization does not bypass the model allowlist for %s",
  async (model) => {
    config.customModels = "-all,+gpt-4o@openai";
    const response = await requestOpenai(
      request(JSON.stringify(legacyPayload(model))),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: true });
    expect(upstream).not.toHaveBeenCalled();
    expect(forwarded).toEqual([]);
  },
);
