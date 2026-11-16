export function matchedPdfItems(items: string[], chunk: string): number[] {
  const normalize = (s: string) =>
    s.replace(/\s+/g, "").normalize("NFKC").toLowerCase();
  const values = items.map(normalize),
    full = values.join(""),
    target = normalize(chunk);
  if (!target) return [];
  let start = full.indexOf(target),
    length = target.length;
  if (start < 0) {
    const probe = target.slice(0, Math.min(80, target.length));
    start = full.indexOf(probe);
    length = probe.length;
  }
  if (start < 0) return [];
  let offset = 0;
  return values.flatMap((value, index) => {
    const from = offset;
    offset += value.length;
    return value.length && offset > start && from < start + length
      ? [index]
      : [];
  });
}
