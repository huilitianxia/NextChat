/** @jest-environment node */
import { jest } from "@jest/globals";
jest.unstable_mockModule("server-only", () => ({}));
const { getServerSideConfig } = await import("../app/config/server");

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

test("server configuration advertises the requested default without an env override", () => {
  delete process.env.DEFAULT_MODEL;
  expect(getServerSideConfig().defaultModel).toBe("gpt-6.2-sol");
  process.env.DEFAULT_MODEL = "  ";
  expect(getServerSideConfig().defaultModel).toBe("gpt-6.2-sol");
});

test("administrator DEFAULT_MODEL retains precedence", () => {
  process.env.DEFAULT_MODEL = " gateway-sol@openai ";
  expect(getServerSideConfig().defaultModel).toBe("gateway-sol@openai");
});
