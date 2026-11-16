import React from "react";
import { jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  isChunkLoadError,
  lazyWithRetry,
  claimRefresh,
} from "../app/utils/lazy-with-retry";
import {
  EQUATION_SYMBOLS,
  EQUATION_PRESETS,
  insertEquation,
} from "../app/utils/equation-editor";
import { ModalErrorBoundary } from "../app/components/lazy-modal";
import katex from "katex";
const chunk = () => new Error("Loading chunk 123 failed.");
test.each([
  new Error("Failed to fetch dynamically imported module"),
  chunk(),
  { name: "ChunkLoadError", message: "oops" },
  new Error("Loading CSS chunk 3 failed"),
])("chunk mismatch classifier %p", (error) =>
  expect(isChunkLoadError(error)).toBe(true),
);
test("business/render errors never cause automatic reload", async () => {
  const loader = jest
      .fn<() => Promise<number>>()
      .mockRejectedValue(new Error("invalid data")),
    exhausted = jest.fn();
  await expect(lazyWithRetry(loader, exhausted)()).rejects.toThrow(
    "invalid data",
  );
  expect(loader).toHaveBeenCalledTimes(1);
  expect(exhausted).not.toHaveBeenCalled();
});
test("one retry succeeds without refreshing", async () => {
  const loader = jest
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(chunk())
      .mockResolvedValueOnce(42),
    exhausted = jest.fn();
  await expect(lazyWithRetry(loader, exhausted)()).resolves.toBe(42);
  expect(loader).toHaveBeenCalledTimes(2);
  expect(exhausted).not.toHaveBeenCalled();
});
test("two chunk failures announce refresh once", async () => {
  const loader = jest.fn<() => Promise<number>>().mockRejectedValue(chunk()),
    exhausted = jest.fn();
  await expect(lazyWithRetry(loader, exhausted)()).rejects.toThrow();
  expect(loader).toHaveBeenCalledTimes(2);
  expect(exhausted).toHaveBeenCalledTimes(1);
});
test("per-build refresh guard survives repeated calls and does not clear stored data", () => {
  const map = new Map([["user-data", "keep"]]),
    storage = {
      getItem: (k: string) => map.get(k) || null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
  expect(claimRefresh(storage, "a")).toBe(true);
  expect(claimRefresh(storage, "a")).toBe(false);
  expect(claimRefresh(storage, "b")).toBe(true);
  expect(map.get("user-data")).toBe("keep");
  expect(
    claimRefresh(
      {
        getItem() {
          throw new Error("denied");
        },
        setItem() {},
      },
      "b",
    ),
  ).toBe(false);
});
test("modal render failure stays inside boundary and manual retry remounts only that component", () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  let fails = true;
  function Child() {
    if (fails) throw new Error("render");
    return <p>Recovered content</p>;
  }
  render(
    <>
      <p>Workspace stays available</p>
      <ModalErrorBoundary title="工具">
        <Child />
      </ModalErrorBoundary>
    </>,
  );
  expect(screen.getByText("Workspace stays available")).toBeInTheDocument();
  expect(screen.queryByText(/Clear All Data/)).not.toBeInTheDocument();
  fails = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载组件" }));
  expect(screen.getByText("Recovered content")).toBeInTheDocument();
  error.mockRestore();
});
test("fraction and root wrap selection and position cursor in the next edit location", () => {
  const fraction = EQUATION_SYMBOLS["微积分"].find(
      (s) => s.wrap === "fraction",
    )!,
    root = EQUATION_SYMBOLS["微积分"].find((s) => s.wrap === "root")!;
  const f = insertEquation("x+y", 0, 3, fraction);
  expect(f.value).toBe("\\frac{x+y}{}");
  expect(f.value.slice(f.cursor - 1, f.cursor + 1)).toBe("{}");
  const r = insertEquation("ab", 0, 2, root);
  expect(r.value).toBe("\\sqrt{ab}");
  expect(r.cursor).toBe(8);
  const empty = insertEquation("", 0, 0, fraction);
  expect(empty.cursor).toBe(6);
});
test("template insertion preserves neighboring text and bounded size", () => {
  expect(insertEquation("AB", 1, 1, { tex: "_{}", label: "sub" })).toEqual({
    value: "A_{}B",
    cursor: 3,
  });
  expect(() =>
    insertEquation("x".repeat(6000), 6000, 6000, { tex: "y", label: "y" }),
  ).toThrow();
});
test("all mini previews and five classic presets are valid KaTeX", () => {
  expect(EQUATION_PRESETS).toHaveLength(5);
  for (const p of [
    ...Object.values(EQUATION_SYMBOLS).flat(),
    ...EQUATION_PRESETS,
  ])
    expect(() =>
      katex.renderToString((p as { preview?: string }).preview || p.tex, {
        throwOnError: true,
        trust: false,
      }),
    ).not.toThrow();
});
