import React from "react";
import { jest } from "@jest/globals";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const copy = jest.fn<(text: string) => Promise<boolean>>();
const renderMermaid =
  jest.fn<(options: { nodes: HTMLElement[] }) => Promise<void>>();
const config = { enableArtifacts: true, enableCodeFold: true };
const session = { mask: { enableArtifacts: true, enableCodeFold: true } };

jest.unstable_mockModule("@/app/utils", () => ({
  copyToClipboard: copy,
  useWindowSize: () => ({ width: 1000, height: 800 }),
}));
jest.unstable_mockModule("@/app/store", () => ({
  useChatStore: () => ({ currentSession: () => session }),
}));
jest.unstable_mockModule("@/app/store/config", () => ({
  useAppConfig: () => config,
}));
jest.unstable_mockModule("mermaid", () => ({
  default: { run: renderMermaid },
}));
jest.unstable_mockModule("@/app/locales", () => ({
  default: { NewChat: { More: "展开代码" } },
}));
jest.unstable_mockModule("@/app/components/ui-lib", () => ({
  showImageModal: jest.fn(),
  FullScreen: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.unstable_mockModule("@/app/components/artifacts", () => ({
  ArtifactsShareButton: () => <button>下载 HTML</button>,
  HTMLPreview: React.forwardRef(function Preview(
    { code }: { code: string },
    _ref,
  ) {
    return <div data-testid="html-preview">{code}</div>;
  }),
}));
for (const name of ["three-dots", "reload", "copy", "confirm"]) {
  jest.unstable_mockModule(`@/app/icons/${name}.svg`, () => ({
    default: () => <svg />,
  }));
}

const { MarkdownContent, PreCode } = await import("../app/components/markdown");

beforeEach(() => {
  jest.useFakeTimers();
  copy.mockResolvedValue(true);
  renderMermaid.mockResolvedValue();
  config.enableArtifacts = true;
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("renders a language header outside pre and copies only complete raw highlighted code", async () => {
  const code = "const answer = 42;\nconsole.log(answer);\n";
  const { container } = render(
    <MarkdownContent content={`\`\`\`typescript\n${code}\`\`\``} />,
  );
  expect(screen.getByText("TypeScript")).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "复制代码" });
  expect(button.closest("pre")).toBeNull();
  expect(container.querySelector("pre > code")?.textContent).toBe(code);
  await act(async () => {
    fireEvent.click(button);
  });
  expect(copy).toHaveBeenCalledWith(code);
  expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(2000));
  expect(screen.getByRole("button", { name: "复制代码" })).toBeInTheDocument();
});

test("shows plain text fallback without adding a header to inline code", () => {
  const { container } = render(
    <MarkdownContent
      content={"Use `inline` first.\n\n```\nplain words\n```"}
    />,
  );
  expect(screen.getByText("纯文本")).toBeInTheDocument();
  expect(container.querySelectorAll(".code-block-header")).toHaveLength(1);
  expect(container.querySelector("p > code")?.textContent).toBe("inline");
});

test("failed copy never claims success", async () => {
  copy.mockResolvedValueOnce(false);
  render(
    <PreCode>
      <code className="language-python">print(1)</code>
    </PreCode>,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
  });
  expect(screen.queryByRole("button", { name: "已复制" })).toBeNull();
});

test("streamed code updates reset copied state and copy the latest complete content", async () => {
  const { rerender } = render(
    <MarkdownContent content={"```js\nconst value ="} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
  });
  expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
  rerender(<MarkdownContent content={"```js\nconst value = 42;\n```"} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
  });
  expect(copy).toHaveBeenLastCalledWith("const value = 42;\n");
});

test("folding keeps raw code complete and expansion available", async () => {
  const height = jest
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(700);
  const code = "console.log('long');\n".repeat(60);
  const { container } = render(
    <MarkdownContent content={`\`\`\`js\n${code}\`\`\``} />,
  );
  const element = container.querySelector("pre > code");
  expect(element).toHaveStyle({ maxHeight: "400px" });
  const expand = container.querySelector(
    ".show-hide-button button",
  ) as HTMLElement;
  expect(expand).not.toBeNull();
  fireEvent.click(expand);
  expect(element).toHaveStyle({ maxHeight: "none" });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
  });
  expect(copy).toHaveBeenCalledWith(code);
  height.mockRestore();
});

test("HTML preview stays separate from the code header and respects its setting", async () => {
  const code = "<div>Hello</div>\n";
  const { rerender } = render(
    <MarkdownContent content={`\`\`\`html\n${code}\`\`\``} />,
  );
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(screen.getByTestId("html-preview").textContent).toBe(code);
  expect(screen.getByRole("button", { name: "下载 HTML" })).toBeInTheDocument();
  config.enableArtifacts = false;
  rerender(
    <MarkdownContent content={`\`\`\`html\n${code}<!-- updated -->\n\`\`\``} />,
  );
  expect(screen.queryByTestId("html-preview")).toBeNull();
});

test("Mermaid preview receives raw diagram text and clears when its code becomes plain text", async () => {
  const { container, rerender } = render(
    <MarkdownContent content={"```mermaid\ngraph TD\n  A --> B\n```"} />,
  );
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(container.querySelector(".mermaid")?.textContent).toBe(
    "graph TD\n  A --> B\n",
  );
  expect(renderMermaid).toHaveBeenCalled();
  rerender(<MarkdownContent content={"```text\nplain\n```"} />);
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(container.querySelector(".mermaid")).toBeNull();
});

test("ordinary raw HTML and unsafe markdown links remain sanitized", () => {
  // react-markdown 8 replaces unsafe targets with an inert javascript:void(0).
  jest.spyOn(console, "error").mockImplementation(() => {});
  const { container } = render(
    <MarkdownContent
      content={"<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))"}
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("a")?.getAttribute("href")).toBe(
    "javascript:void(0)",
  );
});
