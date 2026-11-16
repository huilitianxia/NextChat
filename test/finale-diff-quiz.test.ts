import { compareRevision, revisionPair } from "../app/utils/diff-helper";
import { parseQuiz, gradeQuestion, wrongAnswerDeck } from "../app/utils/quiz";
const source = {
  title: "电路测验",
  questions: [
    {
      id: "q1",
      type: "single",
      question: "欧姆定律？",
      options: ["U=IR", "U=I/R"],
      answer: [0],
      explanation: "电阻为常数时 U=IR。",
    },
    {
      id: "q2",
      type: "multiple",
      question: "SI 单位？",
      options: ["A", "V", "英寸"],
      answer: [0, 1],
      explanation: "A 和 V。",
    },
  ],
};
test("word diff reconstructs both Chinese/English originals without changing whitespace", () => {
  const before = "电压为  5 V\n第二行",
    after = "电压为 12 V\n第二行";
  const parts = compareRevision(before, after);
  expect(
    parts
      .filter((p) => !p.added)
      .map((p) => p.value)
      .join(""),
  ).toBe(before);
  expect(
    parts
      .filter((p) => !p.removed)
      .map((p) => p.value)
      .join(""),
  ).toBe(after);
  expect(parts.some((p) => p.added)).toBe(true);
  expect(parts.some((p) => p.removed)).toBe(true);
});
test("code diff isolates the requested fenced snippet", () => {
  const pair = revisionPair(
    "请修改：\n```js\nconst x = 1;\n```",
    "说明\n```js\nconst x = 2;\n```",
  );
  expect(pair).toEqual({
    before: "const x = 1;",
    after: "const x = 2;",
    code: true,
  });
  expect(
    compareRevision(pair.before, pair.after, true).some((p) => p.added),
  ).toBe(true);
});
test("Chinese prose diff keeps unchanged characters visible", () => {
  const parts = compareRevision("这个方法非常好。", "这个方法效果很好。");
  expect(
    parts
      .filter((p) => !p.added && !p.removed)
      .map((p) => p.value)
      .join(""),
  ).toContain("这个方法");
});
test("plain revision extracts explicit original label", () => {
  expect(
    revisionPair("请学术润色。\n原文：结果很棒。", "结果具有显著优势。").before,
  ).toBe("结果很棒。");
});
test("diff rejects large payload and preserves identical text", () => {
  expect(() => compareRevision("a".repeat(100001), "")).toThrow();
  expect(compareRevision("same", "same")).toEqual([
    { value: "same", added: false, removed: false },
  ]);
});
test("quiz supports single/multiple and letter answers", () => {
  const q = parseQuiz(JSON.stringify(source));
  expect(gradeQuestion(q.questions[0], [0])).toBe(true);
  expect(gradeQuestion(q.questions[1], [1, 0])).toBe(true);
  expect(gradeQuestion(q.questions[1], [0])).toBe(false);
  const letters = JSON.parse(JSON.stringify(source));
  letters.questions[0].answer = ["A"] as any;
  expect(parseQuiz(JSON.stringify(letters)).questions[0].answer).toEqual([0]);
});
test.each([
  { questions: [] },
  { questions: [{ ...source.questions[0], answer: [8] }] },
  { questions: [{ ...source.questions[0], answer: [0, 1] }] },
  { questions: [{ ...source.questions[0], options: ["one"] }] },
  { questions: [{ ...source.questions[0], options: ["", "B"] }] },
  { questions: [{ ...source.questions[0], type: "essay" }] },
  { questions: [source.questions[0], source.questions[0]] },
  { questions: [{ ...source.questions[1], answer: [0, 0] }] },
])("quiz rejects invalid schema %#", (bad) =>
  expect(() => parseQuiz(JSON.stringify(bad))).toThrow(),
);
test("wrong-answer deck excludes unsubmitted and correct questions", () => {
  const q = parseQuiz(JSON.stringify(source));
  expect(wrongAnswerDeck(q, {}).cards).toEqual([]);
  const deck = wrongAnswerDeck(q, { q1: [1], q2: [1, 0] });
  expect(deck.cards).toHaveLength(1);
  expect(deck.cards[0].front).toContain("欧姆定律");
  expect(deck.cards[0].back).toContain("U=IR");
});
test.each(["constructor", "__proto__", "toString"])(
  "quiz rejects reserved state key %s",
  (id) => {
    expect(() =>
      parseQuiz(
        JSON.stringify({ questions: [{ ...source.questions[0], id }] }),
      ),
    ).toThrow("ID 格式无效");
  },
);
