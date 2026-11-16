import {
  cleanAcademicText,
  cleanCounts,
  ngrams,
  sentenceRanges,
  similarityMetrics,
  textTokens,
} from "../app/utils/similarity-meter";
test("Markdown formatting, links, fenced code and math commands are cleaned", () => {
  const clean = cleanAcademicText(
    "# 标题\n\n**Bold** [link](https://example.test) `inline`\n\n```js\nsecretCode()\n```\n\n$\\frac{a}{b}+\\alpha$",
  );
  expect(clean).toContain("Bold link inline");
  expect(clean).toContain("(a)/(b)+α");
  expect(clean).not.toMatch(/secretCode|https|\\frac|\$|\*\*/);
});
test("longer closing fences and unfinished fences do not leak code into counts", () => {
  expect(cleanAcademicText("before\n```\nsecret\n````\nafter")).toBe(
    "before\nafter",
  );
  expect(cleanAcademicText("before\n~~~js\nsecret")).toBe("before");
});
test("Unicode code points, Latin words and Chinese characters counted deterministically", () => {
  expect(cleanCounts("**Hi** 中文 😀")).toMatchObject({
    characters: 5,
    words: 3,
  });
  expect(textTokens("hello中文 don’t １２")).toEqual([
    "hello",
    "中",
    "文",
    "don’t",
    "12",
  ]);
  expect(cleanCounts("e\u0301")).toMatchObject({ characters: 1, words: 1 });
});
test("Jaccard uses unique n-gram sets and an independently known denominator", () => {
  const v = similarityMetrics("a b c", "a b d", 2);
  expect(v.intersection).toBe(1);
  expect(v.union).toBe(3);
  expect(v.similarity).toBeCloseTo(100 / 3, 10);
  expect(similarityMetrics("a a a", "a a", 2).similarity).toBe(100);
});
test("case and Unicode width normalized, both empty undefined, one empty zero", () => {
  expect(similarityMetrics("Hello WORLD", "hello world", 2).similarity).toBe(
    100,
  );
  expect(similarityMetrics("ＡＢ", "ab", 1).similarity).toBe(100);
  expect(similarityMetrics("", "").similarity).toBeNull();
  expect(similarityMetrics("a", "").similarity).toBe(0);
});
test("short phrases compare whole tokens and invalid N fails", () => {
  expect(similarityMetrics("hello", "hello", 3).similarity).toBe(100);
  expect(similarityMetrics("hello", "goodbye", 3).similarity).toBe(0);
  for (const n of [0, 9, 1.5]) expect(() => ngrams(["a"], n)).toThrow();
});
test("literal token boundaries cannot collide", () =>
  expect([...ngrams(["ab", "c"], 2)]).not.toEqual([...ngrams(["a", "bc"], 2)]));
test("very long text rejected", () =>
  expect(() => similarityMetrics("x".repeat(200001), "")).toThrow());
test("sentence offsets keep decimals, closing quotes and final fragments", () => {
  const text = "  电压 3.14 V。 “Continue!”\nLast part";
  const ranges = sentenceRanges(text);
  expect(ranges.map((r) => r.text)).toEqual([
    "电压 3.14 V。",
    "“Continue!”",
    "Last part",
  ]);
  for (const r of ranges) expect(text.slice(r.start, r.end)).toBe(r.text);
  expect(sentenceRanges(" \n ")).toEqual([]);
});
