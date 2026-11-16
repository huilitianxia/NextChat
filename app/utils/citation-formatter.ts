export type Citation = {
  type: "article" | "book" | "preprint";
  authors: string[];
  title: string;
  year: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  place: string;
  doi: string;
  arxiv: string;
  url: string;
  accessed: string;
};
export const EMPTY_CITATION: Citation = {
  type: "article",
  authors: [],
  title: "",
  year: "",
  journal: "",
  volume: "",
  issue: "",
  pages: "",
  publisher: "",
  place: "",
  doi: "",
  arxiv: "",
  url: "",
  accessed: "",
};
export function parseReference(input: string): Citation {
  if (input.length > 20000) throw new Error("参考文献信息过长。");
  const result = { ...EMPTY_CITATION, authors: [] as string[] };
  const doi = input
    .match(/\b10\.\d{4,9}\/[^\s<>"{}]+/i)?.[0]
    ?.replace(/[.,;]+$/, "");
  const arxiv = input.match(
    /(?:arxiv(?:\.org\/(?:abs|pdf)\/|\s*:\s*))((?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?)/i,
  )?.[1];
  if (doi) {
    result.doi = doi;
    result.url = `https://doi.org/${doi}`;
  }
  if (arxiv) {
    result.arxiv = arxiv;
    result.type = "preprint";
    result.url = `https://arxiv.org/abs/${arxiv}`;
  }
  const keys: Record<string, keyof Citation> = {
    作者: "authors",
    authors: "authors",
    author: "authors",
    标题: "title",
    title: "title",
    年份: "year",
    year: "year",
    期刊: "journal",
    journal: "journal",
    卷: "volume",
    volume: "volume",
    期: "issue",
    issue: "issue",
    页码: "pages",
    pages: "pages",
    出版社: "publisher",
    publisher: "publisher",
    出版地: "place",
    place: "place",
    doi: "doi",
    url: "url",
    访问日期: "accessed",
    accessed: "accessed",
    type: "type",
  };
  let fields: Record<string, unknown> = {};
  if (input.trim().startsWith("{")) {
    try {
      fields = JSON.parse(input);
    } catch {
      throw new Error("参考文献 JSON 格式无效。");
    }
  } else
    for (const line of input.split("\n")) {
      const match = /^\s*([^:：]+)[:：]\s*(.+)$/.exec(line);
      if (match) fields[match[1].trim().toLowerCase()] = match[2].trim();
    }
  for (const [key, value] of Object.entries(fields)) {
    const name = Object.hasOwn(keys, key.toLowerCase())
      ? keys[key.toLowerCase()]
      : undefined;
    if (!name) continue;
    if (name === "authors")
      result.authors = (
        Array.isArray(value) ? value : String(value).split(/[;；]/)
      )
        .filter((v) => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 100);
    else if (name === "type") {
      if (["article", "book", "preprint"].includes(String(value)))
        result.type = value as Citation["type"];
    } else if (typeof value === "string" || typeof value === "number")
      result[name] = String(value).trim().slice(0, 3000);
  }
  result.doi = result.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  if (result.url && !/^https?:\/\//i.test(result.url)) result.url = "";
  return result;
}
function person(author: string) {
  if (/[\p{Script=Han}]/u.test(author))
    return { family: author, given: "", initials: "" };
  const comma = author.split(",").map((s) => s.trim()),
    words = author.trim().split(/\s+/);
  const family = comma.length > 1 ? comma[0] : words.pop() || author,
    given = comma.length > 1 ? comma.slice(1).join(" ") : words.join(" ");
  return {
    family,
    given,
    initials: given
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + ".")
      .join(" "),
  };
}
export function citationMissing(c: Citation) {
  const missing = [];
  if (!c.authors.length) missing.push("作者");
  if (!c.title) missing.push("标题");
  if (!/^\d{4}$/.test(c.year)) missing.push("四位年份");
  if (c.type === "article" && !c.journal) missing.push("期刊");
  if (c.type === "book" && !c.publisher) missing.push("出版社");
  if (c.type === "preprint" && !c.arxiv && !c.url) missing.push("预印本链接");
  return missing;
}
const bibEscape = (s: string) =>
  s
    .replace(
      /[\\{}%&#_$]/g,
      (v) =>
        ({
          "\\": "\\textbackslash{}",
          "{": "\\{",
          "}": "\\}",
          "%": "\\%",
          "&": "\\&",
          "#": "\\#",
          _: "\\_",
          $: "\\$",
        })[v]!,
    )
    .replace(/[\r\n]+/g, " ");
export function formatCitation(
  c: Citation,
  style: "gb" | "ieee" | "apa" | "bib",
) {
  const missing = citationMissing(c);
  if (missing.length)
    throw new Error(
      `请补充：${missing.join("、")}。仅凭标识符不能推断完整文献信息。`,
    );
  const people = c.authors.map(person),
    url = c.doi ? `https://doi.org/${c.doi}` : c.url,
    vp = `${c.volume}${c.issue ? `(${c.issue})` : ""}${
      c.pages ? `: ${c.pages}` : ""
    }`;
  if (style === "bib") {
    const key =
      (people[0]?.family || "ref").replace(/[^a-zA-Z0-9]/g, "") + c.year;
    const fields: Record<string, string> = {
      author: people
        .map((p) => (p.given ? `${p.family}, ${p.given}` : p.family))
        .join(" and "),
      title: c.title,
      year: c.year,
    };
    if (c.type === "article")
      Object.assign(fields, {
        journal: c.journal,
        volume: c.volume,
        number: c.issue,
        pages: c.pages.replace(/[-–]/g, "--"),
      });
    if (c.type === "book")
      Object.assign(fields, { publisher: c.publisher, address: c.place });
    if (c.type === "preprint")
      Object.assign(fields, {
        eprint: c.arxiv,
        archivePrefix: c.arxiv ? "arXiv" : "",
        howpublished: "Preprint",
      });
    Object.assign(fields, { doi: c.doi, url });
    return `@${
      c.type === "preprint" ? "misc" : c.type
    }{${key},\n${Object.entries(fields)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k} = {${bibEscape(v)}}`)
      .join(",\n")}\n}`;
  }
  if (style === "gb") {
    const author =
      people
        .slice(0, 3)
        .map(
          (p) =>
            `${p.family.toUpperCase()}${
              p.initials ? " " + p.initials.replace(/\./g, "") : ""
            }`,
        )
        .join(", ") +
      (people.length > 3
        ? /[\p{Script=Han}]/u.test(c.authors[0])
          ? ", 等"
          : ", et al"
        : "");
    if (c.type === "book")
      return `${author}. ${c.title}[M]. ${c.place ? c.place + ": " : ""}${
        c.publisher
      }, ${c.year}.`;
    if (c.type === "preprint")
      return `${author}. ${c.title}[EB/OL]. (${c.year})${
        c.accessed ? `[${c.accessed}]` : ""
      }. ${url}.`;
    return `${author}. ${c.title}[J]. ${c.journal}, ${c.year}${
      vp ? ", " + vp : ""
    }.${c.doi ? " DOI: " + c.doi + "." : ""}`;
  }
  if (style === "ieee") {
    const authors = people
        .slice(0, 6)
        .map((p) => `${p.initials}${p.initials ? " " : ""}${p.family}`),
      author =
        people.length > 6
          ? authors[0] + " et al."
          : authors.length > 1
          ? authors.slice(0, -1).join(", ") + " and " + authors.at(-1)
          : authors[0];
    if (c.type === "book")
      return `[1] ${author}, ${c.title}. ${c.place ? c.place + ": " : ""}${
        c.publisher
      }, ${c.year}.`;
    const detail =
      c.type === "preprint"
        ? `arXiv:${c.arxiv || c.url}`
        : [
            c.journal,
            c.volume && `vol. ${c.volume}`,
            c.issue && `no. ${c.issue}`,
            c.pages && `pp. ${c.pages}`,
          ]
            .filter(Boolean)
            .join(", ");
    return `[1] ${author}, “${c.title},” ${detail}, ${c.year}.${
      c.doi
        ? " doi: " + c.doi + "."
        : c.type === "preprint" && url
        ? " [Online]. Available: " + url
        : ""
    }`;
  }
  const names = people.map(
    (p) => `${p.family}${p.initials ? ", " + p.initials : ""}`,
  );
  const author =
    names.length > 20
      ? names.slice(0, 19).join(", ") + ", … " + names.at(-1)
      : names.length > 1
      ? names.slice(0, -1).join(", ") + ", & " + names.at(-1)
      : names[0];
  const detail =
    c.type === "book"
      ? c.publisher
      : c.type === "preprint"
      ? "[Preprint]. arXiv"
      : `${c.journal}${c.volume ? ", " + c.volume : ""}${
          c.issue ? "(" + c.issue + ")" : ""
        }${c.pages ? ", " + c.pages.replace(/-/g, "–") : ""}`;
  return `${author} (${c.year}). ${c.title}. ${detail}.${url ? " " + url : ""}`;
}
export async function lookupDoi(
  doi: string,
  signal?: AbortSignal,
): Promise<Citation> {
  if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) throw new Error("DOI 格式无效。");
  const response = await fetch(
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    { signal, referrerPolicy: "no-referrer", credentials: "omit" },
  );
  if (!response.ok) throw new Error("未找到 DOI 元数据，请手动填写字段。");
  const { message: m } = await response.json();
  return {
    ...EMPTY_CITATION,
    type: m.type === "book" ? "book" : "article",
    doi,
    authors: (m.author || [])
      .map((a: any) =>
        a.family ? `${a.family}, ${a.given || ""}` : a.name || "",
      )
      .filter(Boolean),
    title: m.title?.[0] || "",
    year: String(
      m.published?.["date-parts"]?.[0]?.[0] ||
        m.issued?.["date-parts"]?.[0]?.[0] ||
        "",
    ),
    journal: m["container-title"]?.[0] || "",
    volume: m.volume || "",
    issue: m.issue || "",
    pages: m.page || "",
    publisher: m.publisher || "",
    url: `https://doi.org/${doi}`,
  };
}
