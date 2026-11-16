import {
  pageReplacement,
  scheduleProcesses,
  inspectFloat,
} from "../app/utils/junior-systems";
const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2],
  jobs = [
    { id: "P1", arrival: 0, burst: 5 },
    { id: "P2", arrival: 1, burst: 3 },
    { id: "P3", arrival: 2, burst: 1 },
  ];
test.each([
  ["FIFO", 10],
  ["LRU", 9],
  ["OPT", 7],
] as const)("standard page trace %s has %d faults", (method, faults) => {
  const p = pageReplacement(refs, 3, method);
  expect(p.faults).toBe(faults);
  expect(p.steps[0].frames).toEqual([7, null, null]);
  expect(p.steps.at(-1)!.frames.filter((x) => x !== null)).toHaveLength(3);
  expect(p.hits + p.faults).toBe(refs.length);
});
test("FIFO exhibits Belady anomaly and hits do not advance its eviction pointer", () => {
  const r = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
  expect(pageReplacement(r, 3, "FIFO").faults).toBe(9);
  expect(pageReplacement(r, 4, "FIFO").faults).toBe(10);
  const p = pageReplacement([1, 2, 1, 3], 2, "FIFO");
  expect(p.steps[3].replaced).toBe(1);
  expect(p.steps[0].frames).toEqual([1, null]);
});
test("LRU refreshes recency on a hit and OPT avoids pages needed soon", () => {
  expect(pageReplacement([1, 2, 1, 3], 2, "LRU").steps[3].replaced).toBe(2);
  expect(pageReplacement([1, 2, 3, 1], 2, "OPT").steps[2].replaced).toBe(2);
  expect(pageReplacement([1, 1, 1], 1, "OPT").rate).toBeCloseTo(1 / 3);
});
test.each([
  [[], 3],
  [[1], 0],
  [[1], 2.5],
  [[1], 9],
  [[NaN], 2],
  [[-1], 2],
  [Array(81).fill(0), 2],
] as [number[], number][])("invalid paging input %p", (r, f) =>
  expect(() => pageReplacement(r, f, "FIFO")).toThrow(),
);
test("FCFS and nonpreemptive SJF produce independently known completion times", () => {
  const f = scheduleProcesses(jobs, "FCFS"),
    s = scheduleProcesses(jobs, "SJF");
  expect(f.results.map((p) => p.completion)).toEqual([5, 8, 9]);
  expect(s.results.map((p) => p.completion)).toEqual([5, 9, 6]);
  expect(s.averageWaiting).toBeCloseTo(8 / 3, 10);
  expect(s.results.map((p) => p.response)).toEqual([0, 5, 3]);
});
test("RR enqueues arrivals at the quantum boundary before requeueing the running job", () => {
  const r = scheduleProcesses(jobs, "RR", 2);
  expect(r.segments.map((s) => s.id)).toEqual([
    "P1",
    "P2",
    "P3",
    "P1",
    "P2",
    "P1",
  ]);
  expect(r.results.map((p) => p.completion)).toEqual([9, 8, 5]);
  expect(r.averageTurnaround).toBeCloseTo(19 / 3, 10);
  expect(r.averageWaiting).toBeCloseTo(10 / 3, 10);
  expect(r.averageResponse).toBe(1);
});
test("idle periods and stable ties are explicit", () => {
  const r = scheduleProcesses(
    [
      { id: "A", arrival: 3, burst: 1 },
      { id: "B", arrival: 10, burst: 1 },
    ],
    "RR",
    1,
  );
  expect(r.segments).toEqual([
    { id: "空闲", start: 0, end: 3 },
    { id: "A", start: 3, end: 4 },
    { id: "空闲", start: 4, end: 10 },
    { id: "B", start: 10, end: 11 },
  ]);
  expect(r.averageWaiting).toBe(0);
  expect(
    scheduleProcesses(
      [
        { id: "b", arrival: 0, burst: 1 },
        { id: "a", arrival: 0, burst: 1 },
      ],
      "SJF",
    ).segments.map((p) => p.id),
  ).toEqual(["b", "a"]);
});
test("invalid scheduler inputs and excessive segment counts rejected", () => {
  expect(() => scheduleProcesses([], "RR")).toThrow();
  expect(() => scheduleProcesses([...jobs, jobs[0]], "FCFS")).toThrow();
  expect(() =>
    scheduleProcesses([{ id: "x", arrival: 0, burst: 0 }], "SJF"),
  ).toThrow();
  expect(() => scheduleProcesses(jobs, "RR", 0)).toThrow();
  expect(() =>
    scheduleProcesses([{ id: "x", arrival: 0, burst: 3000 }], "RR", 1),
  ).toThrow();
});
test.each([
  ["1", 32, "3F800000"],
  ["-0", 32, "80000000"],
  ["0.1", 32, "3DCCCCCD"],
  ["1", 64, "3FF0000000000000"],
  ["0.1", 64, "3FB999999999999A"],
] as const)("IEEE bit pattern %s binary%d", (raw, w, hex) =>
  expect(inspectFloat(raw, w).hex).toBe(hex),
);
test("raw IEEE fields preserve subnormals, negative zero and NaN payloads", () => {
  expect(inspectFloat("00000001", 32, "hex")).toMatchObject({
    kind: "subnormal",
    unbiasedExponent: -126,
    fraction: "1",
  });
  expect(inspectFloat("0000000000000001", 64, "hex").value).toBe(
    Number.MIN_VALUE,
  );
  expect(inspectFloat("8000000000000000", 64, "hex").display).toBe("-0");
  expect(inspectFloat("7FC00001", 32, "hex")).toMatchObject({
    kind: "NaN",
    hex: "7FC00001",
  });
  expect(inspectFloat("7FF0000000000000", 64, "hex").kind).toBe("Infinity");
});
test.each(["", "1abc", "0x3f", "NaN trailing"])(
  "invalid decimal input %p",
  (raw) => expect(() => inspectFloat(raw, 32)).toThrow(),
);
test("hex length is strict and decimals round to representable float32", () => {
  expect(() => inspectFloat("3F80", 32, "hex")).toThrow();
  expect(inspectFloat("16777217", 32).value).toBe(16777216);
  expect(inspectFloat("Infinity", 32).hex).toBe("7F800000");
});
