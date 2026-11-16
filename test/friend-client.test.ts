import { jest } from "@jest/globals";

// Warm up the existing store/client import cycle in the same order as the app.
const { getHeaders, ClientApi, getClientApi } = await import(
  "../app/client/api"
);
const { useAccessStore } = await import("../app/store/access");
const { ModelProvider, ServiceProvider } = await import("../app/constant");
const { ChatGPTApi } = await import("../app/client/platforms/openai");

const profile = {
  name: "朋友",
  greeting: "欢迎回来",
  badge: "VIP",
  major: "research" as const,
  identityId: "qa-client-user",
};
beforeEach(() => {
  useAccessStore.getState().clearIdentity();
});

test("persisted custom providers and unverified profiles cannot restore access", () => {
  const options = useAccessStore.persist.getOptions();
  const merged = options.merge!(
    {
      accessCode: "old-code",
      friendProfile: profile,
      identityVerified: true,
      configReady: true,
      needCode: false,
      openaiApiKey: "sk-client-key",
      useCustomConfig: true,
      openaiUrl: "https://untrusted.example",
    },
    useAccessStore.getState(),
  );
  expect(merged.identityVerified).toBe(false);
  expect(merged.configReady).toBe(false);
  expect(merged.openaiApiKey).toBe("");
  expect(merged.useCustomConfig).toBe(false);
  expect(merged.openaiUrl).toBe("/api/openai");
});

test("every client uses the local server endpoint and never a supplied API key", () => {
  useAccessStore.setState({
    accessCode: "朋友密码",
    openaiApiKey: "sk-client-key",
    openaiUrl: "https://untrusted.example",
    useCustomConfig: true,
  });
  expect(getHeaders()["x-nextchat-access-code"]).toBe(
    encodeURIComponent("朋友密码"),
  );
  expect(JSON.stringify(getHeaders())).not.toContain("sk-client-key");
  expect(new ClientApi(ModelProvider.Claude).llm).toBeInstanceOf(ChatGPTApi);
  expect(getClientApi(ServiceProvider.Google).llm).toBeInstanceOf(ChatGPTApi);
  expect(new ChatGPTApi().path("v1/chat/completions")).toBe(
    "/api/openai/v1/chat/completions",
  );
});

test("successful verification persists only the selected identity fields", async () => {
  global.fetch = jest.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({ ...profile, otherPassword: "must-not-be-stored" }),
      }) as Response,
  ) as typeof fetch;
  await useAccessStore.getState().verifyAccessCode("  valid-code  ");
  const state = useAccessStore.getState();
  expect(state.friendProfile).toEqual(profile);
  expect(state.accessCode).toBe("valid-code");
  expect(state.identityVerified).toBe(true);
  const persisted = useAccessStore.persist.getOptions().partialize!(state);
  expect(Object.keys(persisted).sort()).toEqual([
    "_hasHydrated",
    "accessCode",
    "friendProfile",
  ]);
});

test("incorrect password clears an older identity", async () => {
  useAccessStore.setState({
    accessCode: "old-code",
    friendProfile: profile,
    identityVerified: true,
  });
  global.fetch = jest.fn(
    async () =>
      ({ ok: false, json: async () => ({ error: "密码不正确" }) }) as Response,
  ) as typeof fetch;
  await expect(
    useAccessStore.getState().verifyAccessCode("wrong"),
  ).rejects.toThrow("密码不正确");
  expect(useAccessStore.getState().friendProfile).toBeNull();
  expect(useAccessStore.getState().identityVerified).toBe(false);
});

test("verified campus users keep the new-chat default pinned to gpt-6.1-sol", async () => {
  const { useAppConfig } = await import("../app/store/config");
  useAppConfig.getState().setDefaultModel("other-reasoning-model");
  useAccessStore.setState({ defaultModel: "other-reasoning-model" });
  global.fetch = jest.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({ ...profile, identityId: "qa-pinned-default" }),
      }) as Response,
  ) as typeof fetch;
  await useAccessStore.getState().verifyAccessCode("valid-code");
  expect(useAppConfig.getState().modelConfig.model).toBe("gpt-6.1-sol");
});

test("switching identity preserves the administrator's model settings", () => {
  useAccessStore.setState({
    customModels: "-all,+custom-model",
    defaultModel: "custom-model",
    friendProfile: profile,
    identityVerified: true,
  });
  useAccessStore.getState().clearIdentity();
  expect(useAccessStore.getState().customModels).toBe("-all,+custom-model");
  expect(useAccessStore.getState().defaultModel).toBe("custom-model");
  expect(useAccessStore.getState().friendProfile).toBeNull();
});
