export type RegexMatch = {
  index: number;
  text: string;
  groups: (string | undefined)[];
};
// Self-contained so it can execute in a disposable worker without evaluating user code.
export function regexMatches(
  pattern: string,
  flags: string,
  input: string,
): RegexMatch[] {
  if (
    pattern.length > 1000 ||
    input.length > 50000 ||
    !/^[dgimsuvy]*$/.test(flags) ||
    new Set(flags).size !== flags.length
  )
    throw new Error("表达式、标志或文本超出限制。");
  const regex = new RegExp(pattern, flags),
    results: RegexMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) && results.length < 500) {
    results.push({
      index: match.index,
      text: match[0],
      groups: Array.from(match).slice(1),
    });
    if (!flags.includes("g")) break;
    if (!match[0]) {
      const cp = input.codePointAt(regex.lastIndex);
      regex.lastIndex +=
        (regex.unicode || flags.includes("v")) && cp !== undefined && cp > 65535
          ? 2
          : 1;
    }
  }
  return results;
}
export function regexMatchesAsync(
  pattern: string,
  flags: string,
  input: string,
): Promise<RegexMatch[]> {
  const source = `const run = ${regexMatches.toString()}; onmessage = ({data}) => {try {postMessage({matches:run(...data)})} catch(e) {postMessage({error:e.message})}};`;
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("表达式运行超时，请简化嵌套量词。"));
    }, 600);
    worker.onmessage = ({ data }) => {
      cleanup();
      data.error ? reject(new Error(data.error)) : resolve(data.matches);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("正则测试未完成。"));
    };
    worker.postMessage([pattern, flags, input]);
  });
}
