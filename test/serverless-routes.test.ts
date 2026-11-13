/** @jest-environment node */

import { jest } from "@jest/globals";
import { NextRequest } from "next/server";
import { handle as unavailable } from "../app/api/proxy";
import { POST as publishArtifact } from "../app/api/artifacts/route";
import { POST as syncUpstash } from "../app/api/upstash/[action]/[...key]/route";
import { PUT as syncWebdav } from "../app/api/webdav/[...path]/route";
import { POST as tencent } from "../app/api/tencent/route";

const upstream = jest.fn(async () => new Response("upstream"));
jest.unstable_mockModule("@/app/api/openai", () => ({ handle: upstream }));
const { POST } = await import("../app/api/[provider]/[...path]/route");

describe("serverless routes use only the authenticated OpenAI gateway", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each(["proxy", "unknown", "google", "azure", "anthropic"])(
    "rejects %s without forwarding a caller-selected target or key",
    async (provider) => {
      const request = new NextRequest(
        `https://chat.example/api/${provider}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "x-base-url": "https://api.openai.com.attacker.example",
            Authorization: "Bearer caller-key",
          },
          body: "{}",
        },
      );
      const response = await POST(request, {
        params: { provider, path: ["v1", "chat", "completions"] },
      });
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(upstream).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test("delegates OpenAI requests to the existing authenticated handler", async () => {
    const request = new NextRequest(
      "https://chat.example/api/openai/v1/models",
    );
    const context = { params: { provider: "openai", path: ["v1", "models"] } };
    const response = await POST(request, context);
    expect(upstream).toHaveBeenCalledWith(request, context);
    expect(await response.text()).toBe("upstream");
  });

  test.each([
    ["generic proxy", unavailable],
    ["Cloudflare KV publishing", publishArtifact],
    ["Upstash sync", syncUpstash],
    ["WebDAV sync", syncWebdav],
    ["standalone Tencent", tencent],
  ] as const)("%s makes no external request", async (_name, handler) => {
    const response = await handler();
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
