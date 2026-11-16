import type { KnowledgeNote } from "./knowledge-vault";
import type { FlashDeck } from "./anki-export";
export const EXAM_LAYOUT = {
  width: 11906,
  height: 16838,
  margin: 567,
  columns: 2,
  columnGap: 360,
  fontSize: 17,
  line: 240,
} as const;
function selected(notes: KnowledgeNote[]) {
  if (!notes.length || notes.length > 300)
    throw new Error("每次请选择 1–300 条笔记。");
  if (notes.reduce((n, x) => n + x.content.length, 0) > 1000000)
    throw new Error("选中内容超过 100 万字符，请分批导出。");
  return notes;
}
export function cheatSheetMarkdown(
  notes: KnowledgeNote[],
  title = "期末复习小抄",
) {
  return (
    `# ${title.replace(/[\r\n]/g, " ")}\n\n` +
    selected(notes)
      .map(
        (n) =>
          `## ${n.title.replace(/[\r\n]/g, " ")}\n\n${n.tags
            .map((t) => "#" + t)
            .join(" ")}\n\n${n.content}`,
      )
      .join("\n\n")
  );
}
export function knowledgeDeck(
  notes: KnowledgeNote[],
  title = "知识手账",
): FlashDeck {
  return {
    name: title,
    cards: selected(notes).map((n) => ({
      front: n.title + (n.tags.length ? ` · ${n.tags.join(" / ")}` : ""),
      back: n.content,
    })),
  };
}
export async function examSheetBlob(
  notes: KnowledgeNote[],
  title = "期末复习小抄",
) {
  if (typeof window === "undefined") throw new Error("请在浏览器中导出。");
  const { wordBlob } = await import("./doc-io");
  return wordBlob(cheatSheetMarkdown(notes, title), title, EXAM_LAYOUT);
}
