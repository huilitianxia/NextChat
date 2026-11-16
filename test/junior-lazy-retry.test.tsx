import React, { lazy, Suspense } from "react";
import { jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
// Next 14 App Router's dynamic wrapper uses React.lazy, not the legacy retry subscription.
jest.unstable_mockModule("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType<any> }>) => {
    const Loaded = lazy(loader);
    return function AppRouterDynamic(props: any) {
      return (
        <Suspense fallback={<p>Loading fixture</p>}>
          <Loaded {...props} />
        </Suspense>
      );
    };
  },
}));
const { lazyModal } = await import("../app/components/lazy-modal");
test("manual retry replaces a rejected React.lazy promise, then stays mounted across parent updates", async () => {
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.setItem("campus:chunk-refresh", "unknown");
  type FixtureModule = { default: React.ComponentType<{ value: number }> };
  const loader = jest
    .fn<() => Promise<FixtureModule>>()
    .mockRejectedValueOnce(new Error("Loading chunk 7 failed"))
    .mockRejectedValueOnce(new Error("Loading chunk 7 failed"))
    .mockResolvedValue({
      default: ({ value }) => (
        <label>
          Loaded input
          <input defaultValue={String(value)} />
        </label>
      ),
    });
  const Safe = lazyModal(loader, "测试工具"),
    view = render(<Safe value={1} />);
  await screen.findByRole("button", { name: "重新加载组件" });
  expect(loader).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "重新加载组件" }));
  const input = await screen.findByLabelText("Loaded input");
  fireEvent.change(input, { target: { value: "keep draft" } });
  view.rerender(<Safe value={2} />);
  expect(screen.getByLabelText("Loaded input")).toHaveValue("keep draft");
  expect(loader).toHaveBeenCalledTimes(3);
  errors.mockRestore();
  sessionStorage.clear();
});
