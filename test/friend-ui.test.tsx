import React from "react";
import { jest } from "@jest/globals";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const verifyAccessCode = jest.fn<(code: string) => Promise<void>>();
const navigate = jest.fn();
const state = {
  friendProfile: {
    name: "老王",
    greeting: "<script>never execute</script>",
    badge: "VIP 体验官",
  },
  verifyAccessCode,
  configReady: true,
  needCode: true,
};

jest.unstable_mockModule("@/app/store", () => ({
  useAccessStore: (select: (value: typeof state) => unknown) => select(state),
}));
jest.unstable_mockModule("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

const { AuthPage } = await import("../app/components/auth");
const { WelcomeCard } = await import("../app/components/welcome-card");

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test("password errors keep the user on the login page without displaying key inputs", async () => {
  verifyAccessCode.mockRejectedValueOnce(new Error("访问密码不正确"));
  render(<AuthPage />);
  const password = screen.getByLabelText("访问密码");
  expect(password).toHaveAttribute("type", "password");
  fireEvent.change(password, { target: { value: "incorrect" } });
  fireEvent.submit(
    screen.getByRole("button", { name: /进入专属空间/ }).closest("form")!,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("访问密码不正确");
  expect(verifyAccessCode).toHaveBeenCalledWith("incorrect");
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.queryByText(/API Key/i)).not.toBeInTheDocument();
});

test("waits for successful server verification before entering chat and blocks duplicate submissions", async () => {
  let complete!: () => void;
  verifyAccessCode.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  render(<AuthPage />);
  fireEvent.change(screen.getByLabelText("访问密码"), {
    target: { value: "private-code" },
  });
  const form = screen
    .getByRole("button", { name: /进入专属空间/ })
    .closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(screen.getByRole("button", { name: "正在验证…" })).toBeDisabled();
  expect(navigate).not.toHaveBeenCalled();
  expect(verifyAccessCode).toHaveBeenCalledTimes(1);
  complete();
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith("/chat", { replace: true }),
  );
});

test("personalized greeting is rendered as text and the card has usable feature hints", () => {
  const { container } = render(<WelcomeCard compact />);
  expect(screen.getByText("VIP 体验官")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: /你好，老王\s*。/ }),
  ).toBeVisible();
  expect(screen.getByText("<script>never execute</script>")).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("图片、PDF、Word、文本与代码")).toBeVisible();
  expect(screen.getByText("回复与代码，一键复制")).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "灵感起点" }),
  ).not.toBeInTheDocument();
});

test("all inspiration cards fill their prompt via the callback without submitting or changing the profile", () => {
  const onPromptSelect = jest.fn();
  const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <WelcomeCard compact onPromptSelect={onPromptSelect} />
    </form>,
  );
  const cases = [
    [
      "代码与调试",
      "请帮我分析并调试下面的代码。先定位问题原因，再给出修改方案和验证方法：\n\n",
    ],
    [
      "图片 / PDF 解析",
      "请分析我接下来提供的图片或 PDF，提取关键信息，并说明重要细节与不确定的部分：\n\n",
    ],
    [
      "写作与翻译",
      "请帮我润色或翻译下面的文字，保留原意并让表达自然清晰：\n\n",
    ],
    [
      "复杂问题拆解",
      "请帮我拆解下面的复杂问题，梳理约束、可选方案和可执行的下一步：\n\n",
    ],
  ];
  expect(screen.getByRole("region", { name: "灵感起点" })).toBeVisible();
  expect(onPromptSelect).not.toHaveBeenCalled();
  for (const [title, prompt] of cases) {
    const button = screen.getByRole("button", { name: new RegExp(title) });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onPromptSelect).toHaveBeenLastCalledWith(prompt);
  }
  expect(onPromptSelect).toHaveBeenCalledTimes(4);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByText("VIP 体验官")).toBeVisible();
  expect(screen.getByText("<script>never execute</script>")).toBeVisible();
});

test("the welcome card still renders its children without exposing chat-only inspiration actions", () => {
  render(
    <WelcomeCard>
      <button type="button">开始新对话</button>
    </WelcomeCard>,
  );
  expect(screen.getByRole("button", { name: "开始新对话" })).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "灵感起点" }),
  ).not.toBeInTheDocument();
});
