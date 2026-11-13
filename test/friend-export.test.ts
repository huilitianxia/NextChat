import { jest } from "@jest/globals";
import type { ChatSession } from "../app/store/chat";
import { buildConversationExport } from "../app/utils/friend-export";

const cachedUrl = "https://example.test/api/cache/local-picture.png";
const sessions = [
  {
    id: "conversation",
    topic: "附件导出",
    lastUpdate: 42,
    memoryPrompt: "remember",
    mask: { modelConfig: { apiKey: "must-not-export" } },
    messages: [
      {
        id: "message",
        role: "user",
        content: [
          { type: "text", text: "图片里的内容是什么？" },
          { type: "image_url", image_url: { url: cachedUrl } },
          { type: "image_url", image_url: { url: cachedUrl } },
        ],
      },
    ],
  },
] as unknown as ChatSession[];

test("embeds cached images once, excludes provider configuration, and leaves stored messages unchanged", async () => {
  const resolveImage = jest
    .fn<(_: string) => Promise<string>>()
    .mockResolvedValue("data:image/png;base64,cGljdHVyZQ==");
  const exported = await buildConversationExport(sessions, resolveImage);
  const text = JSON.stringify(exported);
  expect(text).toContain("data:image/png;base64,cGljdHVyZQ==");
  expect(text).not.toContain(cachedUrl);
  expect(text).not.toContain("must-not-export");
  expect(JSON.stringify(sessions)).toContain(cachedUrl);
  expect(resolveImage).toHaveBeenCalledTimes(1);
});

test("missing cached images abort the export instead of writing broken image references", async () => {
  await expect(
    buildConversationExport(sessions, async () => cachedUrl),
  ).rejects.toThrow("附件缓存不可用");
  await expect(
    buildConversationExport(sessions, async () => {
      throw new Error("missing image");
    }),
  ).rejects.toThrow("missing image");
});
