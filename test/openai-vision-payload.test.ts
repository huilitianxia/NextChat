import { jest } from "@jest/globals";
import { ReadableStream as NodeReadableStream } from "node:stream/web";
import { TextDecoder, TextEncoder } from "node:util";
import type { ChatOptions, MultimodalContent } from "../app/client/api";
import type { RequestPayload } from "../app/client/platforms/openai";

// Match the app's initialization order for the shared client/store import cycle.
await import("../app/client/api");
const { ChatGPTApi } = await import("../app/client/platforms/openai");
const { useChatStore } = await import("../app/store/chat");
const { useAccessStore } = await import("../app/store/access");

const originalFetch = global.fetch;
const originalDecoder = globalThis.TextDecoder;
const originalAccess = useAccessStore.getState();
const sent: Array<{ url: string; payload: RequestPayload }> = [];
const mockFetch = jest.fn<typeof fetch>(async (input, init) => {
  sent.push({ url: String(input), payload: JSON.parse(String(init?.body)) });
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ choices: [{ message: { content: "mock reply" } }] }),
  } as Response;
});

const imageA: MultimodalContent = {
  type: "image_url",
  image_url: {
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  },
};
const imageB: MultimodalContent = {
  type: "image_url",
  image_url: {
    url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  },
};

beforeAll(() => {
  globalThis.TextDecoder = TextDecoder;
});

beforeEach(() => {
  sent.length = 0;
  mockFetch.mockClear();
  global.fetch = mockFetch;
  // The result must come from built-in model recognition, not a custom override.
  useAccessStore.setState({ visionModels: "", accessCode: "test-code" });
  const store = useChatStore.getState();
  store.updateTargetSession(store.currentSession(), (session) => {
    session.mask.modelConfig.max_tokens = 12345;
  });
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  global.fetch = originalFetch;
  globalThis.TextDecoder = originalDecoder;
  useAccessStore.setState(originalAccess);
});

async function send(model: string, messages: ChatOptions["messages"]) {
  const onFinish = jest.fn();
  const onError = jest.fn();
  await new ChatGPTApi().chat({
    config: { model, stream: false },
    messages,
    onFinish,
    onError,
  });
  expect(onError).not.toHaveBeenCalled();
  expect(onFinish).toHaveBeenCalledWith("mock reply", expect.anything());
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(sent[0].url).toBe("/api/openai/v1/chat/completions");
  return sent[0].payload;
}

test.each([
  "gpt-6",
  "gpt-6-astra",
  "gpt-6.1-sol",
  "gpt-6.2-sol",
  "gpt-6.2-sol-2026-11-18",
  "gpt-6.1-terra",
  "gpt-6.1-sol-2026-11-14",
  "GPT-6.1-TERRA",
])(
  "%s sends actual multimodal content without introducing a legacy token parameter",
  async (model) => {
    const messages: ChatOptions["messages"] = [
      {
        role: "user",
        content: [{ type: "text", text: "请看这张图片" }, imageA],
      },
    ];
    const payload = await send(model, messages);
    expect(payload.model).toBe(model);
    expect(payload.messages).toEqual(messages);
    expect(payload).not.toHaveProperty("max_tokens");
    expect(payload).not.toHaveProperty("max_completion_tokens");
    if (model.startsWith("gpt-6.2-")) {
      expect(payload).not.toHaveProperty("temperature");
      expect(payload).not.toHaveProperty("top_p");
    }
  },
);

test("image-only GPT-6 messages remain content arrays without requiring text", async () => {
  const messages: ChatOptions["messages"] = [
    { role: "user", content: [imageA] },
  ];
  expect((await send("gpt-6.1-sol", messages)).messages).toEqual(messages);
});

test("keeps previous images and multiple new images in their original order", async () => {
  const messages: ChatOptions["messages"] = [
    { role: "system", content: "Compare the supplied images." },
    { role: "user", content: [imageA] },
    { role: "assistant", content: "请继续发送。" },
    {
      role: "user",
      content: [{ type: "text", text: "比较前后区别" }, imageB, imageA],
    },
  ];
  expect((await send("gpt-6-astra", messages)).messages).toEqual(messages);
});

test("non-vision models retain the existing text-only conversion", async () => {
  const payload = await send("gpt-3.5-turbo", [
    { role: "user", content: [{ type: "text", text: "文字仍应保留" }, imageA] },
  ]);
  expect(payload.messages).toEqual([{ role: "user", content: "文字仍应保留" }]);
});

test("existing GPT-4 vision payload behavior remains unchanged", async () => {
  const messages: ChatOptions["messages"] = [
    { role: "user", content: [imageA] },
  ];
  const payload = await send("gpt-4o", messages);
  expect(payload.messages).toEqual(messages);
  expect(payload.max_tokens).toBe(12345);
});

function pdfPage(): MultimodalContent {
  const prefix = "data:image/jpeg;base64,";
  return {
    type: "image_url",
    image_url: { url: prefix + "a".repeat(480 * 1024 - prefix.length) },
  };
}

test.each([false, true])(
  "rejects an oversized complete request including image history (stream=%s)",
  async (stream) => {
    const messages: ChatOptions["messages"] = [
      { role: "user", content: Array.from({ length: 5 }, pdfPage) },
      { role: "assistant", content: "请发送第二份 PDF。" },
      { role: "user", content: Array.from({ length: 5 }, pdfPage) },
    ];
    const original = JSON.stringify(messages);
    const onFinish = jest.fn();
    const onError = jest.fn();
    await new ChatGPTApi().chat({
      config: { model: "gpt-6.1-sol", stream },
      messages,
      onFinish,
      onError,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0][0] as Error).message).toContain(
      "含历史消息和图片",
    );
    expect((onError.mock.calls[0][0] as Error).message).toContain("新建对话");
    expect(onFinish).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    // The guard rejects instead of dropping or mutating retained images.
    expect(JSON.stringify(messages)).toBe(original);
  },
);

test.each([false, true])(
  "measures UTF-8 bytes instead of character count (stream=%s)",
  async (stream) => {
    const text = "中".repeat(1500000);
    expect(text.length).toBeLessThan(4 * 1024 * 1024);
    const onError = jest.fn();
    await new ChatGPTApi().chat({
      config: { model: "gpt-6.1-sol", stream },
      messages: [{ role: "user", content: text }],
      onFinish: jest.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toContain("超过 4 MiB");
    expect(mockFetch).not.toHaveBeenCalled();
  },
);

test("a valid five-page PDF at the per-page image limit still sends all five images", async () => {
  const messages: ChatOptions["messages"] = [
    {
      role: "user",
      content: [
        { type: "text", text: "请阅读以下五页 PDF。" },
        ...Array.from({ length: 5 }, pdfPage),
      ],
    },
  ];
  expect((await send("gpt-6.1-sol", messages)).messages).toEqual(messages);
});

test.each([false, true])(
  "the interactive OpenAI request opens an SSE response with photo=%s",
  async (withPhoto) => {
    const answer =
      'data: {"choices":[{"delta":{"content":"解答"}}]}\n\ndata: [DONE]\n\n';
    mockFetch.mockResolvedValueOnce(mockStreamResponse(answer, 200));
    const onError = jest.fn();
    const done = new Promise<void>((resolve, reject) => {
      void new ChatGPTApi()
        .chat({
          config: { model: "gpt-6.2-sol", stream: true },
          messages: [{ role: "user", content: withPhoto ? [imageA] : "题目" }],
          onFinish(message) {
            try {
              expect(message).toBe("解答");
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          onError(error) {
            onError(error);
            reject(error);
          },
        })
        .catch(reject);
    });
    await done;
    expect(onError).not.toHaveBeenCalled();
    const [, init] = mockFetch.mock.calls[0];
    expect(new Headers(init?.headers).get("x-nextchat-chat-stream")).toBe("1");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: true,
      messages: [{ role: "user", content: withPhoto ? [imageA] : "题目" }],
    });
  },
);

test.each([
  [504, "Vercel gateway timeout"],
  [200, 'event: nextchat.error\ndata: {"status":504}\n\n'],
])(
  "HTTP or SSE %s timeout reaches the chat error callback",
  async (status, body) => {
    mockFetch.mockResolvedValueOnce(mockStreamResponse(body, status));
    const onFinish = jest.fn();
    const error = await new Promise<Error>((resolve, reject) => {
      void new ChatGPTApi()
        .chat({
          config: { model: "gpt-6.2-sol", stream: true },
          messages: [{ role: "user", content: [imageA] }],
          onFinish,
          onError: resolve,
        })
        .catch(reject);
    });
    expect(error.message).toBe(
      "模型思考时间过长触发了网关超时，请点击重试，或尝试将推理强度调低后再试",
    );
    expect(onFinish).not.toHaveBeenCalled();
  },
);

function mockStreamResponse(body: string, status: number) {
  const encoder = new TextEncoder();
  return {
    ok: status === 200,
    status,
    headers: new Headers({ "content-type": "text/event-stream" }),
    body: new NodeReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
  } as Response;
}
