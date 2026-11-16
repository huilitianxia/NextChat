export const SNAPSHOT_STYLES = [
  "display",
  "position",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin",
  "padding",
  "border",
  "border-radius",
  "border-collapse",
  "border-spacing",
  "background-color",
  "background-image",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "white-space",
  "word-break",
  "overflow-wrap",
  "vertical-align",
  "opacity",
  "overflow",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "align-items",
  "align-self",
  "justify-content",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "box-shadow",
  "text-shadow",
  "object-fit",
  "top",
  "left",
  "right",
  "bottom",
  "transform",
  "transform-origin",
  "z-index",
  "list-style-type",
];
type SnapshotNode = {
  tag?: string;
  text?: string;
  src?: string;
  style?: Record<string, string>;
  children?: SnapshotNode[];
};
// Reconstruct inert layout primitives only: never attach received HTML or executable attributes.
export async function rasterizeSnapshot(snapshot: {
  width: number;
  height: number;
  root: SnapshotNode;
}): Promise<Blob> {
  if (
    !snapshot ||
    !Number.isFinite(snapshot.width) ||
    !Number.isFinite(snapshot.height) ||
    snapshot.width < 1 ||
    snapshot.height < 1 ||
    snapshot.width > 10000 ||
    snapshot.height > 20000
  )
    throw new Error("预览尺寸无效或过大");
  let count = 0,
    characters = 0;
  const tags = new Set(
    "div span p pre code h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr th td section article header footer main aside nav strong em b i u s small blockquote hr br button img label a".split(
      " ",
    ),
  );
  function build(node: SnapshotNode, depth = 0): Node {
    if (++count > 6000 || depth > 80)
      throw new Error("作品过于复杂，无法导出 PNG");
    if (typeof node.text === "string") {
      characters += node.text.length;
      if (characters > 500000) throw new Error("作品文字过多");
      return document.createTextNode(node.text);
    }
    const tag = tags.has(node.tag || "") ? node.tag! : "div",
      element = document.createElement(tag);
    for (const [property, value] of Object.entries(node.style || {})) {
      if (
        SNAPSHOT_STYLES.includes(property) &&
        typeof value === "string" &&
        value.length < 500 &&
        !/(?:url\s*\(|expression|@import|javascript:)/i.test(value)
      )
        element.style.setProperty(property, value);
    }
    if (tag === "img") {
      const source = node.src;
      if (
        typeof source === "string" &&
        source.length < 15000000 &&
        /^data:image\/(png|jpeg|webp|svg\+xml)[;,]/i.test(source)
      )
        (element as HTMLImageElement).src = source;
    }
    for (const child of (Array.isArray(node.children)
      ? node.children
      : []
    ).slice(0, 6000))
      element.appendChild(build(child, depth + 1));
    return element;
  }
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.inert = true;
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${snapshot.width}px;height:${snapshot.height}px;background:white;pointer-events:none;z-index:-2147483648;`;
  const root = build(snapshot.root) as HTMLElement;
  root.style.position = "relative";
  root.style.left = "0";
  root.style.top = "0";
  root.style.width = `${snapshot.width}px`;
  root.style.minHeight = `${snapshot.height}px`;
  holder.appendChild(root);
  document.body.appendChild(holder);
  try {
    await Promise.all(
      [...holder.querySelectorAll("img")].map((img) =>
        img.decode().catch(() => {}),
      ),
    );
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(root, {
      scale: Math.min(2, 4096 / Math.max(snapshot.width, snapshot.height)),
      backgroundColor: "#ffffff",
      logging: false,
      width: snapshot.width,
      height: snapshot.height,
      windowWidth: snapshot.width,
      windowHeight: snapshot.height,
    });
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG 导出失败"))),
        "image/png",
      ),
    );
  } finally {
    holder.remove();
  }
}
