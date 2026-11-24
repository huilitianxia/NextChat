const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ACTIVE_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "link",
  "audio",
  "video",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
]);

function unsafeCss(value: string) {
  return (
    /\\|@import|@font-face|image-set\s*\(|expression\s*\(|javascript:/i.test(
      value,
    ) ||
    [...value.matchAll(/url\s*\(([^)]*)\)/gi)].some(
      ([, url]) => !/^\s*["']?#[\w:.-]+["']?\s*$/.test(url),
    )
  );
}

// Export SVG as a static image, even when the iframe's scripts supplied it.
export function staticSvg(source: string) {
  const text = source.replace(/<svg(?=[\s/>])[^>]*>/i, (tag) =>
    /\sxmlns\s*=/.test(tag)
      ? tag
      : tag.replace("<svg", '<svg xmlns="' + SVG_NAMESPACE + '"'),
  );
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== SVG_NAMESPACE)
    throw new Error("无法读取有效的 SVG 图形。");
  for (const element of [root, ...root.querySelectorAll("*")]) {
    const kind = element.localName.toLowerCase();
    if (
      element.namespaceURI !== SVG_NAMESPACE ||
      ACTIVE_ELEMENTS.has(kind) ||
      (kind === "style" && unsafeCss(element.textContent ?? ""))
    ) {
      element.remove();
      continue;
    }
    for (const attr of [...element.attributes]) {
      const name = attr.localName.toLowerCase();
      const value = attr.value.trim();
      const imageData =
        kind === "image" &&
        /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=\s]+$/i.test(value);
      if (
        name.startsWith("on") ||
        (name === "href" && !value.startsWith("#") && !imageData) ||
        name === "base" ||
        unsafeCss(value)
      ) {
        element.removeAttributeNode(attr);
      }
    }
  }
  return new XMLSerializer().serializeToString(root);
}
