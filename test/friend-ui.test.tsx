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
  expect(screen.getByText("图片、PDF、代码文件")).toBeVisible();
  expect(screen.getByText("回复与代码，一键复制")).toBeVisible();
});
