import { jest } from "@jest/globals";
let captured = "";
jest.unstable_mockModule("html2canvas", () => ({
  default: async (element: HTMLElement) => {
    captured = element.outerHTML;
    return {
      toBlob: (callback: (blob: Blob) => void) =>
        callback(new Blob(["PNG"], { type: "image/png" })),
    };
  },
}));
const { rasterizeSnapshot } = await import("../app/utils/artifact-raster");
test("artifact screenshots reconstruct inert primitives and reject CSS network loads", async () => {
  const result = await rasterizeSnapshot({
    width: 640,
    height: 320,
    root: {
      tag: "div",
      children: [
        { tag: "script", text: "<img src=x onerror=alert(1)>" },
        {
          tag: "iframe",
          style: {
            "background-image": "url(https://untrusted.test/collect)",
            color: "rgb(0, 0, 0)",
          },
          children: [{ text: "safe text" }],
        },
      ],
    },
  });
  expect(result.type).toBe("image/png");
  expect(captured).not.toContain("<script");
  expect(captured).not.toContain("<iframe");
  expect(captured).not.toContain("https://untrusted");
  expect(captured).toContain("&lt;img");
  expect(captured).toContain("safe text");
  expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
});
test("artifact screenshots reject unbounded canvas dimensions", async () => {
  await expect(
    rasterizeSnapshot({ width: Infinity, height: 300, root: { tag: "div" } }),
  ).rejects.toThrow("尺寸");
});
