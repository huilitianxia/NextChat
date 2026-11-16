import type { FlashDeck } from "./anki-export";
export type QuizQuestion = {
  id: string;
  type: "single" | "multiple";
  question: string;
  options: string[];
  answer: number[];
  explanation: string;
};
export type Quiz = { title: string; questions: QuizQuestion[] };
export function parseQuiz(code: string): Quiz {
  if (code.length > 60000) throw new Error("测验内容过长。");
  const data = JSON.parse(code);
  if (
    !Array.isArray(data?.questions) ||
    !data.questions.length ||
    data.questions.length > 50
  )
    throw new Error("测验需要 1–50 道题。");
  const ids = new Set<string>();
  const questions = data.questions.map(
    (q: any, index: number): QuizQuestion => {
      if (
        !["single", "multiple"].includes(q?.type) ||
        typeof q.question !== "string" ||
        !q.question.trim() ||
        q.question.length > 3000 ||
        !Array.isArray(q.options) ||
        q.options.length < 2 ||
        q.options.length > 8 ||
        q.options.some(
          (x: any) => typeof x !== "string" || !x.trim() || x.length > 2000,
        )
      )
        throw new Error(`第 ${index + 1} 题格式无效。`);
      const id = String(q.id ?? index + 1);
      if (
        !/^[\p{L}\p{N}_-]{1,80}$/u.test(id) ||
        Object.hasOwn(Object.prototype, id) ||
        id === "prototype"
      )
        throw new Error("题目 ID 格式无效。");
      if (ids.has(id)) throw new Error("题目 ID 不能重复。");
      ids.add(id);
      const raw = Array.isArray(q.answer) ? q.answer : [q.answer];
      const answer = raw.map((x: any) =>
        typeof x === "string" && /^[A-H]$/i.test(x)
          ? x.toUpperCase().charCodeAt(0) - 65
          : x,
      );
      if (
        !answer.length ||
        answer.some(
          (x: any) => !Number.isInteger(x) || x < 0 || x >= q.options.length,
        ) ||
        new Set(answer).size !== answer.length ||
        (q.type === "single" && answer.length !== 1)
      )
        throw new Error(
          `第 ${index + 1} 题答案无效；使用从 0 开始的索引或 A–H。`,
        );
      return {
        id,
        type: q.type,
        question: q.question,
        options: q.options,
        answer: answer.sort((a: number, b: number) => a - b),
        explanation:
          typeof q.explanation === "string" ? q.explanation.slice(0, 6000) : "",
      };
    },
  );
  return {
    title:
      typeof data.title === "string" ? data.title.slice(0, 150) : "随堂测验",
    questions,
  };
}
export function gradeQuestion(question: QuizQuestion, selected: number[]) {
  const values = [...new Set(selected)].sort((a, b) => a - b);
  return (
    values.length === question.answer.length &&
    values.every((x, i) => x === question.answer[i])
  );
}
export function wrongAnswerDeck(
  quiz: Quiz,
  graded: Record<string, number[]>,
): FlashDeck {
  return {
    name: `${quiz.title} · 错题`,
    cards: quiz.questions
      .filter(
        (q) => Object.hasOwn(graded, q.id) && !gradeQuestion(q, graded[q.id]),
      )
      .map((q) => ({
        front: `${q.question}\n${q.options
          .map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`)
          .join("\n")}`,
        back: `正确答案：${q.answer
          .map((i) => String.fromCharCode(65 + i) + ". " + q.options[i])
          .join("；")}\n${q.explanation}`,
      })),
  };
}
