import { fitChatHistory } from "../app/utils/chat-payload";
import { chatMessagesBytes } from "../app/utils/attachment-policy";
import { normalizeMarkdownMath } from "../app/utils/markdown-math";
import { isChatNetworkInterruption } from "../app/utils/chat-stream-protocol";
import type { RequestMessage } from "../app/client/api";

test("preserves the system, attachment turn and last three turns when trimming", () => {
  const system: RequestMessage = { role: "system", content: "系统" };
  const old: RequestMessage[] = [
    { role: "user", content: "早期冗余".repeat(100) },
    { role: "assistant", content: "reply" },
  ];
  const attachment: RequestMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "[附件：课件.pdf]\n正文" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } },
      ],
    },
    { role: "assistant", content: "附件结论" },
  ];
  const recent: RequestMessage[] = ["前两轮", "上一轮", "当前"].map(
    (content) => ({ role: "user", content }),
  );
  const kept = [system, ...attachment, ...recent];
  const history = [system, ...old, ...attachment, ...recent];
  expect(fitChatHistory(history, chatMessagesBytes(kept))).toEqual({
    messages: kept,
    removed: 1,
  });
  expect(history).toHaveLength(8);
});

test("a mandatory attachment that cannot fit produces the new-session notice", () => {
  const history: RequestMessage[] = [
    { role: "user", content: "[附件：课件.pdf]\n" + "文".repeat(1000) },
  ];
  expect(() => fitChatHistory(history, 1000)).toThrow(
    "当前会话附件过大，建议开启新对话继续追问",
  );
});

test("preserves dollar-delimited equations and escapes prices in prose", () => {
  expect(
    normalizeMarkdownMath("标价 $19.99 或 $25。然后算 $2x + 3$ 和 $4$。"),
  ).toBe("标价 \\$19.99 或 \\$25。然后算 $2x + 3$ 和 $4$。");
  expect(normalizeMarkdownMath("USD $19.99, and $20 if shipped")).toBe(
    "USD \\$19.99, and \\$20 if shipped",
  );
});

test("normalizes backslash math outside inline and fenced code", () => {
  const code = "``const price = '$10'; \\(ignore\\)``\n~~~txt\n\\[keep\\]\n~~~";
  expect(
    normalizeMarkdownMath("变量 \\( x + 2 \\)，方程 \\[x^2 = 1\\]\n" + code),
  ).toBe("变量 $x + 2$，方程 \n\n$$\nx^2 = 1\n$$\n\n\n" + code);
});

test("classifies browser network aborts separately from application errors", () => {
  expect(
    isChatNetworkInterruption(new DOMException("Failed", "AbortError")),
  ).toBe(true);
  expect(isChatNetworkInterruption(new TypeError("Load failed"))).toBe(true);
  expect(isChatNetworkInterruption(new Error("请求被限流"))).toBe(false);
});
