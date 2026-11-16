import {
  useWorkspacePreferences,
  validatePreferences,
} from "../app/store/workspace-preferences";
import {
  activateIdentity,
  identityStorageKey,
} from "../app/utils/identity-storage";
import { selectionPrompt } from "../app/utils/selection-actions";
test("theme and effort are isolated per identity and restore on switching", async () => {
  await activateIdentity("polish-a");
  useWorkspacePreferences
    .getState()
    .setPreferences({ mode: "dark", palette: "purple", effort: "xhigh" });
  expect(
    JSON.parse(
      localStorage.getItem(identityStorageKey("workspace-preferences"))!,
    ),
  ).toMatchObject({ mode: "dark", effort: "xhigh" });
  await activateIdentity("polish-b");
  expect(useWorkspacePreferences.getState()).toMatchObject({
    mode: "auto",
    palette: "green",
    effort: "medium",
  });
  await activateIdentity("polish-a");
  expect(useWorkspacePreferences.getState()).toMatchObject({
    mode: "dark",
    palette: "purple",
    effort: "xhigh",
  });
  await activateIdentity("locked");
  expect(localStorage.getItem("nextchat:appearance:identity")).toBeNull();
});
test("corrupt preferences cannot inject appearance attributes", () => {
  expect(
    validatePreferences({ mode: "bad", palette: "__proto__", effort: "max" }),
  ).toEqual({ mode: "auto", palette: "green", effort: "medium" });
});
test("selection actions quote only the selected excerpt and include a usable Anki schema", () => {
  expect(selectionPrompt("深入解释", "片段\n下一行")).toContain(
    "> 片段\n> 下一行",
  );
  expect(selectionPrompt("制作为 Anki 卡片", "欧姆定律")).toContain(
    '"front":"问题"',
  );
  expect(selectionPrompt("未知操作", "text")).toBe("");
  expect(selectionPrompt("学术润色", " ")).toBe("");
});
