import React, { useState } from "react";
import { jest } from "@jest/globals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

jest.unstable_mockModule("@/app/components/emoji", () => ({
  Avatar: () => <span />,
}));
jest.unstable_mockModule("@/app/locales", () => ({
  default: { UI: { Confirm: "确认", Cancel: "取消" } },
}));
jest.unstable_mockModule("@/app/icons/close.svg", () => ({
  default: () => <svg />,
}));
const { Selector } = await import("../app/components/ui-lib");

afterEach(cleanup);
const items = [
  { title: "Model A", value: "a" },
  { title: "Disabled model", value: "disabled", disable: true },
  { title: "Model B", value: "b" },
];

test("renders outside clipped/transformed parents and restores focus after a single selection", () => {
  const select = jest.fn();
  const close = jest.fn();
  const parentClick = jest.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <div
        data-testid="clipped"
        style={{
          overflow: "hidden",
          backdropFilter: "blur(20px)",
          transform: "translateZ(0)",
        }}
        onClick={parentClick}
      >
        <button onClick={() => setOpen(true)}>Open models</button>
        {open && (
          <Selector
            title="Models"
            items={items}
            defaultSelectedValue="b"
            onSelection={select}
            onClose={() => {
              close();
              setOpen(false);
            }}
          />
        )}
      </div>
    );
  }
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Open models" });
  opener.focus();
  fireEvent.click(opener);
  parentClick.mockClear();
  const dialog = screen.getByRole("dialog", { name: "Models" });
  expect(dialog.parentElement?.parentElement).toBe(document.body);
  expect(screen.getByTestId("clipped")).not.toContainElement(dialog);
  expect(screen.getByRole("option", { name: "Model B" })).toHaveFocus();
  fireEvent.click(screen.getByRole("option", { name: "Disabled model" }));
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("option", { name: "Model A" }));
  expect(select).toHaveBeenCalledWith(["a"]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(parentClick).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
});

test("keyboard skips disabled choices, contains focus, and closes on Escape", () => {
  const close = jest.fn();
  render(<Selector items={items} onClose={close} defaultSelectedValue="a" />);
  const first = screen.getByRole("option", { name: "Model A" });
  const last = screen.getByRole("option", { name: "Model B" });
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Home" });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: "End" });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(screen.getByRole("button", { name: "关闭选择列表" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Escape" });
  expect(close).toHaveBeenCalledTimes(1);
});

test("content clicks keep the dialog open, backdrop closes it, and multiple selection stays open", () => {
  const close = jest.fn(),
    select = jest.fn();
  render(
    <Selector
      title="Models"
      items={items}
      multiple
      onClose={close}
      onSelection={select}
    />,
  );
  fireEvent.click(screen.getByRole("heading", { name: "Models" }));
  fireEvent.click(screen.getByRole("option", { name: "Model A" }));
  fireEvent.click(screen.getByRole("option", { name: "Model B" }));
  expect(select).toHaveBeenLastCalledWith(["a", "b"]);
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(document.querySelector("[data-selector-overlay]")!);
  expect(close).toHaveBeenCalledTimes(1);
});

test("empty lists still provide a reachable close button and portal cleans up on unmount", () => {
  const close = jest.fn();
  const view = render(<Selector items={[]} onClose={close} />);
  expect(screen.getByText("暂无可选项")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "关闭选择列表" }));
  expect(close).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(document.querySelector("[data-selector-overlay]")).toBeNull();
});
