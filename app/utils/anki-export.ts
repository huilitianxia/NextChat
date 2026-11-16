import { loadClientScript, escapeHtml } from "./client-runtime";
import type { SqlJsStatic } from "sql.js";
export type FlashDeck = {
  name: string;
  cards: { front: string; back: string }[];
};
export function parseFlashcards(code: string): FlashDeck {
  let value: any;
  try {
    value = JSON.parse(code);
  } catch {
    const cards: FlashDeck["cards"] = [];
    const pairs = code.split(/\n\s*---\s*\n/);
    for (const pair of pairs) {
      const match =
        /(?:^|\n)(?:Q|问|问题)\s*[:：]\s*([\s\S]+?)\n(?:A|答|答案)\s*[:：]\s*([\s\S]+)/i.exec(
          pair,
        );
      if (match) cards.push({ front: match[1].trim(), back: match[2].trim() });
    }
    value = { name: "NextChat 学习卡", cards };
  }
  if (Array.isArray(value)) value = { name: "NextChat 学习卡", cards: value };
  if (
    !value ||
    !Array.isArray(value.cards) ||
    !value.cards.length ||
    value.cards.length > 500
  )
    throw new Error(
      "请提供 1–500 张卡片：JSON cards 数组（front/back），或以 --- 分隔的 Q:/A: 问答。",
    );
  const cards = value.cards.map((card: any) => {
    if (
      typeof card.front !== "string" ||
      typeof card.back !== "string" ||
      !card.front.trim() ||
      !card.back.trim() ||
      card.front.length + card.back.length > 15000
    )
      throw new Error(
        "每张卡片需包含非空 front 和 back，总长度不超过 15,000 字符。",
      );
    return { front: card.front, back: card.back };
  });
  return {
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim().slice(0, 120)
        : "NextChat 学习卡",
    cards,
  };
}
const schema = `CREATE TABLE col(id integer primary key,crt integer not null,mod integer not null,scm integer not null,ver integer not null,dty integer not null,usn integer not null,ls integer not null,conf text not null,models text not null,decks text not null,dconf text not null,tags text not null);
CREATE TABLE notes(id integer primary key,guid text not null,mid integer not null,mod integer not null,usn integer not null,tags text not null,flds text not null,sfld integer not null,csum integer not null,flags integer not null,data text not null);
CREATE TABLE cards(id integer primary key,nid integer not null,did integer not null,ord integer not null,mod integer not null,usn integer not null,type integer not null,queue integer not null,due integer not null,ivl integer not null,factor integer not null,reps integer not null,lapses integer not null,left integer not null,odue integer not null,odid integer not null,flags integer not null,data text not null);
CREATE TABLE revlog(id integer primary key,cid integer not null,usn integer not null,ease integer not null,ivl integer not null,lastIvl integer not null,factor integer not null,time integer not null,type integer not null);
CREATE TABLE graves(usn integer not null,oid integer not null,type integer not null);
CREATE INDEX ix_notes_usn ON notes(usn);CREATE INDEX ix_cards_usn ON cards(usn);CREATE INDEX ix_revlog_usn ON revlog(usn);CREATE INDEX ix_cards_nid ON cards(nid);CREATE INDEX ix_cards_sched ON cards(did,queue,due);CREATE INDEX ix_revlog_cid ON revlog(cid);CREATE INDEX ix_notes_csum ON notes(csum);`;
async function digest(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function ankiBlob(deck: FlashDeck) {
  await loadClientScript("/toolkit/sql-wasm.js");
  const SQL = await (
    window as unknown as { initSqlJs: (config: object) => Promise<SqlJsStatic> }
  ).initSqlJs({ locateFile: () => "/toolkit/sql-wasm.wasm" });
  const db = new SQL.Database(),
    { default: JSZip } = await import("jszip");
  try {
    db.run(schema);
    const now = Date.now(),
      seconds = Math.floor(now / 1000),
      did = parseInt((await digest(deck.name)).slice(0, 12), 16),
      mid = 1794768000000;
    const model = {
      id: mid,
      name: "NextChat 基础问答",
      type: 0,
      mod: seconds,
      usn: -1,
      sortf: 0,
      did,
      flds: ["Front", "Back"].map((name, ord) => ({
        name,
        ord,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
        media: [],
      })),
      tmpls: [
        {
          name: "问答",
          ord: 0,
          qfmt: "{{Front}}",
          afmt: '{{FrontSide}}<hr id="answer">{{Back}}',
          bqfmt: "",
          bafmt: "",
          did: null,
          bfont: "",
          bsize: 0,
        },
      ],
      css: ".card{font:20px Arial,sans-serif;text-align:left;color:#183c35;background:white;line-height:1.7;padding:24px}",
      req: [[0, "all", [0]]],
      tags: [],
      vers: [],
      latexPre: "",
      latexPost: "",
      latexsvg: false,
    };
    const deckInfo = (id: number, name: string) => ({
      id,
      name,
      desc: "",
      mod: seconds,
      usn: -1,
      dyn: 0,
      collapsed: false,
      browserCollapsed: false,
      conf: 1,
      extendNew: 0,
      extendRev: 50,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
    });
    const config = {
      id: 1,
      name: "Default",
      mod: 0,
      usn: 0,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: {
        delays: [1, 10],
        ints: [1, 4],
        initialFactor: 2500,
        order: 1,
        perDay: 20,
        bury: true,
        separate: true,
      },
      rev: {
        perDay: 200,
        ease4: 1.3,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        bury: true,
        minSpace: 1,
      },
      lapse: {
        delays: [10],
        mult: 0,
        minInt: 1,
        leechFails: 8,
        leechAction: 0,
      },
    };
    db.run("INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
      1,
      seconds,
      now,
      now,
      11,
      0,
      0,
      0,
      JSON.stringify({
        nextPos: deck.cards.length + 1,
        curDeck: did,
        activeDecks: [did],
        sortType: "noteFld",
        sortBackwards: false,
        newSpread: 0,
        collapseTime: 1200,
        addToCur: true,
        dayLearnFirst: false,
        dueCounts: true,
        estTimes: true,
      }),
      JSON.stringify({ [mid]: model }),
      JSON.stringify({
        1: deckInfo(1, "Default"),
        [did]: deckInfo(did, deck.name),
      }),
      JSON.stringify({ 1: config }),
      "{}",
    ]);
    const notes = db.prepare(
        "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ),
      cards = db.prepare(
        "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      );
    try {
      for (let i = 0; i < deck.cards.length; i++) {
        const card = deck.cards[i],
          nid = now + i * 2;
        const front = escapeHtml(card.front.replace(/\x1f/g, " ")).replace(
            /\n/g,
            "<br>",
          ),
          back = escapeHtml(card.back.replace(/\x1f/g, " ")).replace(
            /\n/g,
            "<br>",
          );
        notes.run([
          nid,
          (
            await digest(deck.name + "\0" + card.front + "\0" + card.back)
          ).slice(0, 16),
          mid,
          seconds,
          -1,
          "",
          `${front}\x1f${back}`,
          card.front,
          parseInt((await digest(card.front)).slice(0, 8), 16),
          0,
          "",
        ]);
        cards.run([
          nid + 1,
          nid,
          did,
          0,
          seconds,
          -1,
          0,
          0,
          i + 1,
          0,
          2500,
          0,
          0,
          0,
          0,
          0,
          0,
          "",
        ]);
      }
    } finally {
      notes.free();
      cards.free();
    }
    const zip = new JSZip();
    zip.file("collection.anki2", db.export());
    zip.file("media", "{}");
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  } finally {
    db.close();
  }
}
