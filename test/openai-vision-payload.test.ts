import { jest } from "@jest/globals";
import type { ChatOptions, MultimodalContent } from "../app/client/api";
import type { RequestPayload } from "../app/client/platforms/openai";

// Match the app's initialization order for the shared client/store import cycle.
await import("../app/client/api");
const { ChatGPTApi } = await import("../app/client/platforms/openai");
const { useChatStore } = await import("../app/store/chat");
const { useAccessStore } = await import("../app/store/access");

const originalFetch = global.fetch;
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
