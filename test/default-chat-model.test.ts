import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_MODELS,
  ServiceProvider,
} from "../app/constant";
import { collectModelsWithDefaultModel } from "../app/utils/model";

await import("../app/client/api");
const { DEFAULT_CONFIG, useAppConfig } = await import("../app/store/config");
const { createEmptyMask } = await import("../app/store/mask");

beforeEach(() => {
  DEFAULT_CONFIG.modelConfig.model = DEFAULT_CHAT_MODEL;
  DEFAULT_CONFIG.lastAppliedDefaultModel = DEFAULT_CHAT_MODEL;
  useAppConfig.getState().reset();
});

function oldConfig(model: string) {
  const { defaultModelSource, lastAppliedDefaultModel, ...state } =
    DEFAULT_CONFIG;
  return {
    ...state,
    modelConfig: { ...state.modelConfig, model, temperature: 0.7 },
  };
}

test("fresh settings and new chats use the requested exact model ID", () => {
  expect(DEFAULT_CHAT_MODEL).toBe("gpt-6.2-sol");
  expect(useAppConfig.getState().modelConfig.model).toBe(DEFAULT_CHAT_MODEL);
  expect(createEmptyMask().modelConfig.model).toBe(DEFAULT_CHAT_MODEL);
  expect(DEFAULT_CONFIG.modelConfig.temperature).toBe(1);
  expect(useAppConfig.getState().modelConfig.temperature).toBe(1);
  expect(createEmptyMask().modelConfig.temperature).toBe(1);
});

test("legacy global mini default migrates once without losing other preferences", async () => {
  const migrated = await useAppConfig.persist.getOptions().migrate!(
    oldConfig("gpt-4o-mini"),
    4.1,
  );
  expect(migrated.modelConfig.model).toBe(DEFAULT_CHAT_MODEL);
  expect(migrated.modelConfig.temperature).toBe(0.7);
  expect(migrated.defaultModelSource).toBe("automatic");
  useAppConfig.setState(migrated);
  useAppConfig.getState().setDefaultModel("gpt-4o-mini");
  const reloaded = await useAppConfig.persist.getOptions().migrate!(
    useAppConfig.getState(),
    4.2,
  );
  expect(reloaded.modelConfig.model).toBe("gpt-4o-mini");
  expect(reloaded.defaultModelSource).toBe("custom");
});

test("legacy nondefault selection survives migration and an administrator override", async () => {
  const migrated = await useAppConfig.persist.getOptions().migrate!(
    oldConfig("chosen-model"),
    4.1,
  );
  useAppConfig.setState(migrated);
  useAppConfig.getState().applyServerDefault("admin-model@openai");
  expect(useAppConfig.getState().modelConfig.model).toBe("chosen-model");
  expect(useAppConfig.getState().defaultModelSource).toBe("custom");
});

test("administrator default updates automatic settings and new chats, including after a previous override", () => {
  useAppConfig.getState().applyServerDefault("admin-model@openai");
  expect(createEmptyMask().modelConfig.model).toBe("admin-model");
  useAppConfig.getState().applyServerDefault("new-admin-model");
  expect(createEmptyMask().modelConfig.model).toBe("new-admin-model");
  useAppConfig.getState().reset();
  expect(useAppConfig.getState().modelConfig.model).toBe("new-admin-model");
});

test("an automatic previous Sol default follows the upgrade while a historical chat keeps its model", () => {
  const mask = createEmptyMask();
  mask.syncGlobalConfig = false;
  mask.modelConfig.model = "gpt-6.1-sol";
  useAppConfig.setState({
    defaultModelSource: "automatic",
    lastAppliedDefaultModel: "gpt-6.1-sol",
    modelConfig: {
      ...useAppConfig.getState().modelConfig,
      model: "gpt-6.1-sol",
    },
  });
  useAppConfig.getState().applyServerDefault(DEFAULT_CHAT_MODEL);
  expect(createEmptyMask().modelConfig.model).toBe("gpt-6.2-sol");
  expect(mask.modelConfig.model).toBe("gpt-6.1-sol");
});

test("an explicit local choice and an independently selected conversation stay unchanged", () => {
  const mask = createEmptyMask();
  mask.syncGlobalConfig = false;
  mask.modelConfig.model = "session-model";
  useAppConfig.getState().setDefaultModel(DEFAULT_CHAT_MODEL);
  useAppConfig.getState().applyServerDefault("admin-model");
  expect(useAppConfig.getState().modelConfig.model).toBe(DEFAULT_CHAT_MODEL);
  expect(mask.modelConfig.model).toBe("session-model");
});

test("model discovery cannot hide the configured default or mutate built-in availability", () => {
  const mini = DEFAULT_MODELS.find(
    (model) => model.name === "gpt-4o-mini" && model.provider.id === "openai",
  )!;
  useAppConfig.getState().mergeModels([mini]);
  const listed = collectModelsWithDefaultModel(
    useAppConfig.getState().models,
    "",
    DEFAULT_CHAT_MODEL,
  );
  expect(
    listed.find(
      (model) =>
        model.name === DEFAULT_CHAT_MODEL && model.provider?.id === "openai",
    ),
  ).toMatchObject({ available: true, isDefault: true });
  expect(
    DEFAULT_MODELS.find((model) => model.name === DEFAULT_CHAT_MODEL)
      ?.available,
  ).toBe(true);
});

test("a custom administrator model is selectable without a matching discovery entry", () => {
  const listed = collectModelsWithDefaultModel([], "", "gateway-sol@OpenAI");
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    name: "gateway-sol",
    available: true,
    isDefault: true,
    provider: { providerName: ServiceProvider.OpenAI },
  });
});

test.each([`-${DEFAULT_CHAT_MODEL}@openai`, "-all,+gpt-4o-mini@openai"])(
  "administrator restrictions still apply: %s",
  (customModels) => {
    const listed = collectModelsWithDefaultModel(
      DEFAULT_MODELS,
      customModels,
      DEFAULT_CHAT_MODEL,
    );
    expect(
      listed.find(
        (model) =>
          model.name === DEFAULT_CHAT_MODEL && model.provider?.id === "openai",
      )?.available,
    ).toBe(false);
  },
);
