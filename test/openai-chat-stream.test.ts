/** @jest-environment node */
import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import {
  CHAT_STREAM_ERROR,
  CHAT_STREAM_HEADER,
  GATEWAY_TIMEOUT_MESSAGE,
} from "../app/utils/chat-stream-protocol";

jest.unstable_mockModule("server-only", () => ({}));
jest.unstable_mockModule("@/app/config/server", () => ({
  getServerSideConfig: () => ({
    baseUrl: "https://upstream.test",
    apiKey: "qa-server-key",
    customModels: "-all,+gpt-6.2-sol",
  }),
}));
const { POST, runtime } = await import(
  "../app/api/openai/v1/chat/completions/route"
);

const env = { ...process.env };
const originalFetch = global.fetch;
const upstream = jest.fn<typeof fetch>();
const model = "gpt-6.2-sol";
const image = {
  type: "image_url",
  image_url: { url: "data:image/png;base64,AQ==" },
};
const message = {
  role: "user",
  content: [{ type: "text", text: "这道题怎么做？" }, image],
};

beforeEach(() => {
  process.env.CODE = "";
  process.env.FRIEND_PROFILES = JSON.stringify({
    "qa-password": { name: "严", greeting: "hello", badge: "chem" },
  });
  upstream.mockReset();
  global.fetch = upstream;
});

afterEach(() => jest.useRealTimers());
afterAll(() => {
  process.env = env;
  global.fetch = originalFetch;
});

function request(
  payload: Record<string, unknown> = {},
  {
    authorized = true,
    stream = true,
    signal,
  }: {
    authorized?: boolean;
    stream?: boolean;
    signal?: AbortSignal;
  } = {},
) {
  return new NextRequest("https://app.test/api/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized && { "x-nextchat-access-code": "qa-password" }),
      ...(stream && { [CHAT_STREAM_HEADER]: "1" }),
    },
    body: JSON.stringify({
      model,
      messages: [message],
      stream: false,
      ...payload,
    }),
    signal,
  });
}

function sse(body = "data: [DONE]\n\n") {
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function readText(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    text += decoder.decode(value, { stream: !done });
    if (done) return text;
  }
}

test("the Edge route sends data before the upstream responds and keeps the photo payload", async () => {
  jest.useFakeTimers();
  let resolve!: (response: Response) => void;
  upstream.mockImplementation(
    () => new Promise<Response>((r) => (resolve = r)),
  );

  const response = await POST(
    request({
      temperature: 0.5,
      top_p: 0.8,
      logprobs: true,
      reasoning_effort: "high",
    }),
  );
  expect(runtime).toBe("edge");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    ": connected\n\n",
  );
  const remainder = readText(reader);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(upstream).toHaveBeenCalledTimes(1);
  const [url, init] = upstream.mock.calls[0];
  expect(url).toBe("https://upstream.test/v1/chat/completions");
  expect(new Headers(init?.headers).get("authorization")).toBe(
    "Bearer qa-server-key",
  );
  expect(JSON.parse(String(init?.body))).toEqual({
    model,
    messages: [message],
    stream: true,
    reasoning_effort: "high",
  });

  resolve(
    sse('data: {"choices":[{"delta":{"content":"解答"}}]}\n\ndata: [DONE]\n\n'),
  );
  expect(await remainder).toContain(
    ': keep-alive\nevent: nextchat.effort\ndata: {"effective":"high","fallback":false}\n\n',
  );
});

test("heartbeats do not split an upstream SSE line or its multibyte text", async () => {
  jest.useFakeTimers();
  const raw =
    'data: {"choices":[{"delta":{"content":"解答"}}]}\r\n\r\ndata: [DONE]\r\n\r\n';
  const bytes = new TextEncoder().encode(raw);
  const split = raw.indexOf("解") + 1;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  upstream.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(output) {
          controller = output;
          output.enqueue(bytes.subarray(0, split));
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    ),
  );
  const reply = (await POST(request())).text();
  await jest.advanceTimersByTimeAsync(10_000);
  controller.enqueue(bytes.subarray(split));
  controller.close();
  expect(await reply).toBe(": connected\n\n" + raw);
});

test("retries transient statuses once after 1 second and again after 2 seconds", async () => {
  jest.useFakeTimers();
  upstream
    .mockResolvedValueOnce(Response.json({}, { status: 429 }))
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(sse());
  const response = await POST(request());
  const body = response.text();
  await jest.advanceTimersByTimeAsync(999);
  expect(upstream).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(upstream).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(1999);
  expect(upstream).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(1);
  expect(upstream).toHaveBeenCalledTimes(3);
  expect(await body).toBe(": connected\n\ndata: [DONE]\n\n");
});

test("retries stop when the browser disconnects during backoff", async () => {
  jest.useFakeTimers();
  const controller = new AbortController();
  upstream.mockResolvedValueOnce(Response.json({}, { status: 502 }));
  const response = await POST(request({}, { signal: controller.signal }));
  const body = response.text();
  await jest.advanceTimersByTimeAsync(100);
  controller.abort();
  await jest.advanceTimersByTimeAsync(5000);
  expect(await body).toBe(": connected\n\n");
  expect(upstream).toHaveBeenCalledTimes(1);
});

test("upstream may think past 180 seconds and is aborted at 240 seconds", async () => {
  jest.useFakeTimers();
  let signal: AbortSignal | null | undefined;
  upstream.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init?.signal;
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        });
      }),
  );

  const response = await POST(request());
  const body = response.text();
  await jest.advanceTimersByTimeAsync(180_000);
  expect(signal?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(signal?.aborted).toBe(true);
  expect(await body).toContain(
    "event: " +
      CHAT_STREAM_ERROR +
      '\ndata: {"status":504,"message":"' +
      GATEWAY_TIMEOUT_MESSAGE +
      '"}',
  );
});

test("canceling the browser read aborts a pending upstream request", async () => {
  let signal: AbortSignal | null | undefined;
  upstream.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        signal = init?.signal;
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        });
      }),
  );
  const reader = (await POST(request())).body!.getReader();
  await reader.read();
  expect(signal?.aborted).toBe(false);
  await reader.cancel();
  expect(signal?.aborted).toBe(true);
});

test.each([
  [504, "Gateway Timeout"],
  [502, "Internal error: FUNCTION_INVOCATION_TIMEOUT"],
])(
  "an upstream HTTP %s arrives as a friendly SSE timeout",
  async (status, body) => {
    upstream.mockResolvedValue(new Response(body, { status }));
    const response = await POST(request());
    const result = await response.text();
    expect(result).toContain(GATEWAY_TIMEOUT_MESSAGE);
    expect(result).not.toContain(body);
    expect(upstream).toHaveBeenCalledTimes(1);
  },
);

test("authentication, the allowlist and upload limits apply before opening a stream", async () => {
  expect((await POST(request({}, { authorized: false }))).status).toBe(401);
  expect((await POST(request({ model: "not-permitted" }))).status).toBe(403);
  const overLimit = request();
  overLimit.headers.set("content-length", String(4 * 1024 * 1024 + 1));
  expect((await POST(overLimit)).status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});

test("clients using the legacy JSON contract keep the original HTTP status", async () => {
  upstream.mockResolvedValue(
    Response.json({ error: "denied" }, { status: 429 }),
  );
  const response = await POST(request({}, { stream: false }));
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ error: "denied" });
  expect(JSON.parse(String(upstream.mock.calls[0][1]?.body)).stream).toBe(
    false,
  );
});
