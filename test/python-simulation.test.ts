/** @jest-environment node */
import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import { readPythonEvents } from "../app/utils/python-stream";

jest.unstable_mockModule("server-only", () => ({}));
const { POST, maxDuration } = await import("../app/api/python-chat/route");
const { GET } = await import("../app/api/container-file/route");

const upstream = jest.fn<typeof fetch>();
const originalFetch = global.fetch;
const env = { ...process.env };
const accessHeader = "x-nextchat-access-code";
const key = "qa-python-key-one";
const secondKey = "qa-python-key-two";
const owner = "python-绘图";
const chart = {
  type: "container_file_citation",
  container_id: "cntr_test-1",
  file_id: "cfile_chart-1",
  filename: "response.svg",
};
const expectedTool = [
  { type: "code_interpreter", container: { type: "auto" } },
];
const messages = [
  { role: "system", content: "保留自定义系统提示" },
  { role: "user", content: "这是什么电路？" },
  { role: "assistant", content: "一阶 RC 低通滤波器。" },
  {
    role: "user",
    content: [
      { type: "text", text: "请画出幅频特性" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AQ==" } },
    ],
  },
];

beforeEach(() => {
  process.env.OPENAI_API_KEY = key + "," + secondKey;
  process.env.BASE_URL = "https://python-upstream.test/v1/";
  process.env.CUSTOM_MODELS = "-all,+gpt-6.2-sol,+gpt-6.2-astra";
  process.env.DEFAULT_MODEL = "gpt-6.2-sol";
  process.env.CODE = owner + ",another-user";
  process.env.FRIEND_PROFILES = "";
  upstream.mockReset();
  global.fetch = upstream;
  jest.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  global.fetch = originalFetch;
  process.env = env;
});

function chatRequest(value = {}, code = owner) {
  return new NextRequest("https://chat.test/api/python-chat", {
    method: "POST",
    headers: {
      [accessHeader]: encodeURIComponent(code),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, ...value }),
  });
}

function fileRequest(url: string, code = owner) {
  return new NextRequest("https://chat.test" + url, {
    headers: { [accessHeader]: encodeURIComponent(code) },
  });
}

function mockStream(...events: unknown[]) {
  const data = new TextEncoder().encode(
    events
      .map((event) => "data: " + JSON.stringify(event) + "\r\n\r\n")
      .join(""),
  );
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= data.length) controller.close();
      else {
        controller.enqueue(data.slice(offset, offset + 7));
        offset += 7;
      }
    },
  });
  upstream.mockResolvedValueOnce(
    new Response(stream, { headers: { "Content-Type": "text/event-stream" } }),
  );
}

async function eventsFrom(response: Response) {
  const events = [];
  for await (const event of readPythonEvents(response.body!))
    events.push(event);
  return events;
}

test("streams the selected model's text and deduplicates generated image citations", async () => {
  mockStream(
    { type: "response.output_text.delta", delta: "这是一阶" },
    { type: "response.output_text.annotation.added", annotation: chart },
    { type: "response.output_text.delta", delta: "低通滤波器。" },
    {
      type: "response.completed",
      response: {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                annotations: [
                  chart,
                  { ...chart, file_id: "cfile-second", filename: "第二张.PNG" },
                  { ...chart, file_id: "cfile-data", filename: "readings.csv" },
                  { ...chart, file_id: "../../outside" },
                ],
              },
            ],
          },
        ],
      },
    },
  );
  const response = await POST(chatRequest({ model: "gpt-6.2-astra" }));
  expect(maxDuration).toBe(60);
  expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  const [inputUrl, init] = upstream.mock.calls[0];
  expect(inputUrl).toBe("https://python-upstream.test/v1/responses");
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer " + key);
  expect(new Headers(init?.headers).has(accessHeader)).toBe(false);
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    model: "gpt-6.2-astra",
    tools: expectedTool,
    stream: true,
    store: false,
    input: [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: [
          { type: "input_text", text: "请画出幅频特性" },
          {
            type: "input_image",
            image_url: "data:image/png;base64,AQ==",
            detail: "auto",
          },
        ],
      },
    ],
  });
  const events = await eventsFrom(response);
  expect(events.map((event) => event.type)).toEqual([
    "delta",
    "delta",
    "image",
    "image",
    "done",
  ]);
  expect(
    events
      .slice(0, 2)
      .map((event) => event.text)
      .join(""),
  ).toBe("这是一阶低通滤波器。");
  expect(events[2].text).toBe("\n\n![仿真图表](" + events[2].url + ")\n\n");
  expect(JSON.stringify(events)).not.toContain(key);

  // Auth may choose a different configured key; the file still uses its issuer.
  jest.mocked(Math.random).mockReturnValue(0.9);
  upstream.mockResolvedValueOnce(
    new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
      headers: { "Content-Type": "application/octet-stream" },
    }),
  );
  const imageUrl = String(events[2].url);
  const image = await GET(fileRequest(imageUrl));
  expect(image.status).toBe(200);
  expect(image.headers.get("Content-Type")).toBe("image/svg+xml");
  expect(image.headers.get("Cache-Control")).toContain("private");
  expect(image.headers.get("Content-Security-Policy")).toContain("sandbox");
  expect(await image.text()).toContain("<svg");
  expect(upstream.mock.calls[1][0]).toBe(
    "https://python-upstream.test/v1/containers/cntr_test-1/files/cfile_chart-1/content",
  );
  expect(
    new Headers(upstream.mock.calls[1][1]?.headers).get("Authorization"),
  ).toBe("Bearer " + key);
  expect((await GET(fileRequest(imageUrl, "another-user"))).status).toBe(403);
  expect(
    (await GET(fileRequest(imageUrl.replace("cfile_chart-1", "cfile-other"))))
      .status,
  ).toBe(403);
  expect((await GET(fileRequest(imageUrl, "wrong-password"))).status).toBe(401);
  expect(upstream).toHaveBeenCalledTimes(2);
});

test("rejects a missing account, disallowed model and malicious file IDs without a fetch", async () => {
  expect((await POST(chatRequest({}, "incorrect"))).status).toBe(401);
  expect((await POST(chatRequest({ model: "unapproved" }))).status).toBe(403);
  expect(
    (
      await POST(
        chatRequest({ messages: [{ role: "assistant", content: "wrong" }] }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await GET(
        fileRequest(
          "/api/container-file?container_id=%2E%2E%2Foutside&file_id=cfile",
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await GET(
        fileRequest("/api/container-file?container_id=cntr&file_id=cfile"),
      )
    ).status,
  ).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

test("preserves partial output and reports an interrupted upstream without a false completion", async () => {
  mockStream({ type: "response.output_text.delta", delta: "计算中" });
  const events = await eventsFrom(await POST(chatRequest()));
  expect(events).toEqual([
    { type: "delta", text: "计算中" },
    { type: "error", message: expect.stringContaining("连接中断") },
  ]);
  expect(JSON.parse(String(upstream.mock.calls[0][1]?.body)).model).toBe(
    "gpt-6.2-sol",
  );
});
