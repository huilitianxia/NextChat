import { codeBlocks } from "./doc-io";
export type SlideLayout = "title" | "bullets" | "two-column";
export type CampusSlide = {
  title: string;
  subtitle: string;
  bullets: string[];
  notes: string;
  layout: SlideLayout;
};
export type CampusDeck = { title: string; slides: CampusSlide[] };
export type SlideTheme = "academic" | "tech";
const string = (value: unknown, max = 4000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export function parseSlides(value: unknown): CampusDeck {
  const raw = Array.isArray(value) ? value : (value as any)?.slides;
  if (!Array.isArray(raw) || !raw.length || raw.length > 40)
    throw new Error("演示文稿需要 1–40 张幻灯片。");
  const slides = raw.map((slide: any, index: number): CampusSlide => {
    if (!slide || typeof slide.title !== "string" || !slide.title.trim())
      throw new Error(`第 ${index + 1} 页缺少标题。`);
    const bullets = slide.bullets ?? slide.bullet_points ?? [];
    if (
      !Array.isArray(bullets) ||
      bullets.some((item: unknown) => typeof item !== "string") ||
      bullets.length > 40
    )
      throw new Error(`第 ${index + 1} 页要点格式无效。`);
    if (
      slide.title.length > 200 ||
      bullets.some((item: string) => item.length > 4000)
    )
      throw new Error("单页文字过长，请拆分内容。");
    return {
      title: slide.title.trim(),
      subtitle: string(slide.subtitle, 800),
      bullets: bullets.map((item: string) => item.trim()).filter(Boolean),
      notes: string(slide.notes ?? slide.speaker_notes, 20000),
      layout: ["title", "bullets", "two-column"].includes(
        slide.layout ?? slide.layout_hint,
      )
        ? slide.layout ?? slide.layout_hint
        : "bullets",
    };
  });
  return {
    title: string((value as any)?.title, 160) || slides[0].title,
    slides,
  };
}
export function detectSlides(markdown: string): CampusDeck | null {
  if (markdown.length > 200000) return null;
  const block = codeBlocks(markdown).find((item) => item.language === "slides");
  if (block) {
    try {
      return parseSlides(JSON.parse(block.code));
    } catch {
      return null;
    }
  }
  if (codeBlocks(markdown).length || !/^\s*---\s*$/m.test(markdown))
    return null;
  const parts = markdown
    .split(/^\s*---\s*$/m)
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    parts.length < 2 ||
    parts.length > 40 ||
    parts.some((part) => !/^#{1,3}\s+\S/.test(part))
  )
    return null;
  try {
    return parseSlides(
      parts.map((part) => {
        const [heading, ...lines] = part.split("\n");
        const noteIndex = lines.findIndex((line) =>
          /^(?:notes?|备注|演讲备注)\s*[:：]/i.test(line),
        );
        const content = noteIndex < 0 ? lines : lines.slice(0, noteIndex);
        return {
          title: heading.replace(/^#+\s*/, ""),
          bullets: content
            .map((line) => line.replace(/^\s*(?:[-*+] |\d+\. )/, "").trim())
            .filter(Boolean),
          notes:
            noteIndex < 0
              ? ""
              : lines
                  .slice(noteIndex)
                  .join("\n")
                  .replace(/^[^:：]*[:：]\s*/, ""),
        };
      }),
    );
  } catch {
    return null;
  }
}
const units = (text: string) =>
  [...text].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
export function paginateSlides(deck: CampusDeck): CampusDeck {
  const slides: CampusSlide[] = [];
  for (const slide of deck.slides) {
    const items = slide.bullets.flatMap((bullet) => {
      const result: string[] = [];
      let line = "";
      for (const char of bullet) {
        if (units(line + char) > 230) {
          result.push(line);
          line = "";
        }
        line += char;
      }
      if (line) result.push(line);
      return result;
    });
    let group: string[] = [],
      weight = 0,
      page = 0;
    const flush = () => {
      slides.push({
        ...slide,
        title: slide.title + (page ? ` · 续 ${page + 1}` : ""),
        bullets: group,
        layout:
          slide.layout === "title" && items.length ? "bullets" : slide.layout,
      });
      page++;
      group = [];
      weight = 0;
    };
    for (const item of items) {
      const cost =
        Math.max(
          1,
          Math.ceil(units(item) / (slide.layout === "two-column" ? 34 : 74)),
        ) + 0.5;
      if (group.length && (weight + cost > 8 || group.length >= 5)) flush();
      group.push(item);
      weight += cost;
    }
    if (group.length || !page) flush();
  }
  if (slides.length > 160) throw new Error("内容过长，请拆成多份演示文稿。");
  return { ...deck, slides };
}
export async function presentationBlob(
  input: CampusDeck,
  theme: SlideTheme = "academic",
): Promise<Blob> {
  if (typeof window === "undefined") throw new Error("请在浏览器中导出 PPT。");
  const runtime = window as unknown as {
    PptxGenJS?: typeof import("pptxgenjs").default;
  };
  if (!runtime.PptxGenJS) {
    const { loadClientScript } = await import("./client-runtime");
    await loadClientScript("/toolkit/pptxgen.bundle.js");
  }
  const PptxGenJS = runtime.PptxGenJS;
  if (!PptxGenJS) throw new Error("PPT 工具未能加载，请重试。");
  const deck = paginateSlides(parseSlides(input)),
    pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Campus Workspace";
  pptx.subject = input.title;
  pptx.title = input.title;
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
  };
  const color =
    theme === "tech"
      ? {
          bg: "0D1A2C",
          fg: "EAF4FF",
          muted: "A7BCD4",
          accent: "6EDBD5",
          line: "29415A",
        }
      : {
          bg: "FFFFFF",
          fg: "20343C",
          muted: "627580",
          accent: "367F73",
          line: "DDE8E5",
        };
  deck.slides.forEach((item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: color.bg };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.55,
      y: 0.62,
      w: 0.07,
      h: 0.48,
      line: { color: color.accent },
      fill: { color: color.accent },
    });
    slide.addText(item.title, {
      x: 0.82,
      y: 0.5,
      w: 11.85,
      h: 1,
      fontSize: item.layout === "title" ? 36 : 28,
      bold: true,
      color: color.fg,
      margin: 0,
      fit: "shrink",
      valign: "middle",
    });
    if (item.subtitle)
      slide.addText(item.subtitle, {
        x: 0.82,
        y: 1.55,
        w: 11.6,
        h: 0.7,
        fontSize: 16,
        color: color.muted,
        margin: 0,
        fit: "shrink",
      });
    const columns = item.layout === "two-column" ? 2 : 1,
      mid = Math.ceil(item.bullets.length / columns);
    for (let col = 0; col < columns; col++) {
      const bullets = item.bullets.slice(col * mid, (col + 1) * mid);
      if (!bullets.length) continue;
      slide.addText(
        bullets.map((text) => ({
          text,
          options: {
            bullet: { indent: 20 },
            hanging: 4,
            breakLine: true,
            paraSpaceAfterPt: 16,
          },
        })),
        {
          x: 0.95 + col * 6,
          y: item.subtitle ? 2.5 : 1.9,
          w: columns === 2 ? 5.45 : 11.4,
          h: item.subtitle ? 3.95 : 4.55,
          fontSize: 22,
          color: color.fg,
          margin: 0,
          valign: "top",
          fit: "shrink",
          lineSpacingMultiple: 1.15,
        },
      );
    }
    slide.addShape(pptx.ShapeType.line, {
      x: 0.8,
      y: 6.85,
      w: 11.75,
      h: 0,
      line: { color: color.line, width: 0.6 },
    });
    slide.addText(deck.title, {
      x: 0.8,
      y: 7,
      w: 10.8,
      h: 0.22,
      fontSize: 9,
      color: color.muted,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(String(index + 1).padStart(2, "0"), {
      x: 11.8,
      y: 6.97,
      w: 0.75,
      h: 0.28,
      fontSize: 11,
      color: color.accent,
      align: "right",
      margin: 0,
    });
    slide.addNotes(item.notes || "");
  });
  return (await pptx.write({ outputType: "blob", compression: true })) as Blob;
}
