import type { AttachmentTextBuffer } from "./attachment-policy";

const DRAWING_NAMESPACES = [
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://purl.oclc.org/ooxml/drawingml/main",
];
const RELATIONSHIP_NAMESPACES = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  "http://purl.oclc.org/ooxml/officeDocument/relationships",
];
const READ_ERROR =
  "无法读取此 PPTX，请确认文件未损坏或加密，或另存为 PDF 后重试。";

export async function extractPresentationText(
  data: ArrayBuffer,
  text: AttachmentTextBuffer,
  signal?: AbortSignal,
) {
  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(data);
    const readXml = async (path: string) => {
      signal?.throwIfAborted();
      const source = await zip.file(path)?.async("string");
      if (!source || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))
        throw new Error(READ_ERROR);
      const xml = new DOMParser().parseFromString(source, "application/xml");
      if (xml.getElementsByTagName("parsererror").length)
        throw new Error(READ_ERROR);
      return xml;
    };
    const presentation = await readXml("ppt/presentation.xml");
    const rels = await readXml("ppt/_rels/presentation.xml.rels");
    const targets = new Map<string, string>();
    for (const rel of rels.getElementsByTagNameNS("*", "Relationship")) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (
        !id ||
        !target ||
        rel.getAttribute("TargetMode") === "External" ||
        !rel.getAttribute("Type")?.endsWith("/slide")
      )
        continue;
      // Resolve the relationship within the package only. No resource is fetched.
      const path = new URL(target, "https://pptx.invalid/ppt/presentation.xml");
      if (
        path.origin === "https://pptx.invalid" &&
        !path.search &&
        !path.hash
      ) {
        targets.set(id, decodeURIComponent(path.pathname.slice(1)));
      }
    }
    const slides = presentation.getElementsByTagNameNS("*", "sldId");
    for (let index = 0; index < slides.length; index++) {
      const slide = slides[index];
      const id = RELATIONSHIP_NAMESPACES.map((ns) =>
        slide.getAttributeNS(ns, "id"),
      ).find(Boolean);
      const target = id && targets.get(id);
      if (!target) throw new Error(READ_ERROR);
      const xml = await readXml(target);
      const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p"))
        .filter((paragraph) =>
          DRAWING_NAMESPACES.includes(paragraph.namespaceURI ?? ""),
        )
        .map((paragraph) =>
          Array.from(
            paragraph.getElementsByTagNameNS(paragraph.namespaceURI, "t"),
            (node) => node.textContent ?? "",
          )
            .join("")
            .trim(),
        )
        .filter(Boolean);
      if (paragraphs.length) {
        if (text.characterCount) text.append("\n\n");
        text.append(`[第 ${index + 1} 张幻灯片]\n${paragraphs.join("\n")}`);
      }
    }
  } catch {
    signal?.throwIfAborted();
    throw new Error(READ_ERROR);
  }
}
