"use client";
import { useId, useMemo, useState } from "react";
import { parseQuiz, gradeQuestion, wrongAnswerDeck } from "../utils/quiz";
import { ankiBlob } from "../utils/anki-export";
import { saveFile } from "../utils/doc-io";
import styles from "./finale.module.scss";
export default function QuizCard({ code }: { code: string }) {
  const quizId = useId();
  const parsed = useMemo(() => {
    try {
      return { quiz: parseQuiz(code), error: "" };
    } catch (e) {
      return { quiz: null, error: (e as Error).message };
    }
  }, [code]);
  const [selected, setSelected] = useState<Record<string, number[]>>({}),
    [graded, setGraded] = useState<Record<string, number[]>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!parsed.quiz)
    return (
      <p className={styles.error} role="alert">
        测验解析：{parsed.error}
      </p>
    );
  const quiz = parsed.quiz,
    wrong = wrongAnswerDeck(quiz, graded),
    answered = Object.keys(graded).length,
    correct = quiz.questions.filter(
      (q) => Object.hasOwn(graded, q.id) && gradeQuestion(q, graded[q.id]),
    ).length;
  return (
    <section className={styles.quiz} aria-label={quiz.title}>
      <h3>{quiz.title}</h3>
      <small>
        已完成 {answered}/{quiz.questions.length} · 正确 {correct}
      </small>
      {quiz.questions.map((q, i) => {
        const done = Object.hasOwn(graded, q.id);
        return (
          <fieldset key={q.id}>
            <legend>
              {i + 1}. {q.question}（{q.type === "single" ? "单选" : "多选"}）
            </legend>
            {q.options.map((option, index) => (
              <label key={index}>
                <input
                  type={q.type === "single" ? "radio" : "checkbox"}
                  name={`${quizId}-${q.id}`}
                  checked={(selected[q.id] || []).includes(index)}
                  disabled={done}
                  onChange={() => {
                    const next =
                      q.type === "single"
                        ? [index]
                        : (selected[q.id] || []).includes(index)
                        ? selected[q.id].filter((n) => n !== index)
                        : [...(selected[q.id] || []), index];
                    setSelected((s) => ({ ...s, [q.id]: next }));
                    if (q.type === "single")
                      setGraded((s) => ({ ...s, [q.id]: next }));
                  }}
                />
                {String.fromCharCode(65 + index)}. {option}
              </label>
            ))}
            {!done && q.type === "multiple" && (
              <button
                disabled={!selected[q.id]?.length}
                onClick={() =>
                  setGraded((s) => ({ ...s, [q.id]: selected[q.id] }))
                }
              >
                提交本题
              </button>
            )}
            {done && (
              <div role="status">
                <p
                  className={
                    gradeQuestion(q, graded[q.id])
                      ? styles.correct
                      : styles.wrong
                  }
                >
                  {gradeQuestion(q, graded[q.id]) ? "回答正确" : "暂未答对"} ·
                  正确答案{" "}
                  {q.answer.map((n) => String.fromCharCode(65 + n)).join("、")}
                </p>
                <p>{q.explanation}</p>
              </div>
            )}
          </fieldset>
        );
      })}
      <div className={styles.toolbar} data-export-hide>
        <button
          onClick={() => {
            setSelected({});
            setGraded({});
          }}
        >
          重新作答
        </button>
        <button
          disabled={!wrong.cards.length || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await saveFile(await ankiBlob(wrong), `${quiz.title}-错题.apkg`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          错题导出 Anki (.apkg) · {wrong.cards.length}
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
