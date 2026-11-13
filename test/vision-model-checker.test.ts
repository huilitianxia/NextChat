import { isVisionModel } from "../app/utils";
import { useAccessStore } from "../app/store/access";

describe("isVisionModel", () => {
  const originalVisionModels = useAccessStore.getState().visionModels;

  beforeEach(() => {
    useAccessStore.setState({ visionModels: "" });
  });

  afterEach(() => {
    useAccessStore.setState({ visionModels: originalVisionModels });
  });

  test("should identify vision models using regex patterns", () => {
    const visionModels = [
      "gpt-4-vision",
      "claude-3-opus",
      "gemini-1.5-pro",
      "gemini-2.0",
      "gemini-exp-vision",
      "learnlm-vision",
      "qwen-vl-max",
      "qwen2-vl-max",
      "gpt-4-turbo",
      "dall-e-3",
    ];

    visionModels.forEach((model) => {
      expect(isVisionModel(model)).toBe(true);
    });
  });

  test("should exclude specific models", () => {
    expect(isVisionModel("claude-3-5-haiku-20241022")).toBe(false);
  });

  test.each([
    "gpt-6",
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
    "gpt-6.1-sol",
    "gpt-6.1-terra",
    "gpt-6.1-sol-2026-09-29",
    "gpt-6.2-custom-chat",
    "GPT-6.1-SOL",
  ])(
    "recognizes GPT-6 conversation model %s without a custom allowlist",
    (model) => {
      expect(isVisionModel(model)).toBe(true);
    },
  );

  test.each(["gpt-60", "gpt-60-sol", "gpt-600", "custom-gpt-6.1-sol"])(
    "does not classify unrelated ID %s as the GPT-6 family",
    (model) => expect(isVisionModel(model)).toBe(false),
  );

  test("should not identify non-vision models", () => {
    const nonVisionModels = [
      "gpt-3.5-turbo",
      "gpt-4-turbo-preview",
      "claude-2",
      "regular-model",
    ];

    nonVisionModels.forEach((model) => {
      expect(isVisionModel(model)).toBe(false);
    });
  });

  test("should identify custom names from the server-provided VISION_MODELS setting", () => {
    // Avoid names containing 'vision': those pass the built-in regex and would
    // not actually test the browser's server-configured model list.
    useAccessStore.setState({ visionModels: "custom-camera, another-camera" });

    expect(isVisionModel("custom-camera")).toBe(true);
    expect(isVisionModel("another-camera")).toBe(true);
    expect(isVisionModel("gpt-6.1-sol")).toBe(true);
    expect(isVisionModel("unrelated-model")).toBe(false);
  });

  test("should handle empty VISION_MODELS", () => {
    useAccessStore.setState({ visionModels: "" });
    expect(isVisionModel("unrelated-model")).toBe(false);

    expect(isVisionModel("unrelated-model")).toBe(false);
    expect(isVisionModel("gpt-4-vision")).toBe(true);
  });
});
