import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdir, cp } from "node:fs/promises";
const require = createRequire(import.meta.url);
const destination = join(process.cwd(), "public", "toolkit");
await mkdir(destination, { recursive: true });
// PptxGenJS's ES entry imports node:fs/node:https even in a client import.
// Serve its complete browser build locally, loaded only on export.
await cp(
  join(dirname(require.resolve("pptxgenjs")), "pptxgen.bundle.js"),
  join(destination, "pptxgen.bundle.js"),
);
for (const [source, target] of [
  ["sql.js/dist/sql-wasm.js", "sql-wasm.js"],
  ["sql.js/dist/sql-wasm.wasm", "sql-wasm.wasm"],
  ["echarts/dist/echarts.min.js", "echarts.min.js"],
  ["html2canvas/dist/html2canvas.min.js", "html2canvas.min.js"],
])
  await cp(require.resolve(source), join(destination, target));
await cp(
  join(
    dirname(require.resolve("mermaid/package.json")),
    "dist",
    "mermaid.min.js",
  ),
  join(destination, "mermaid.min.js"),
);
// Use one complete D3 runtime for Markmap to avoid mixed selection prototypes.
const markmapRequire = createRequire(require.resolve("markmap-view"));
const d3Entry = markmapRequire.resolve("d3");
await cp(
  join(dirname(d3Entry), "..", "dist", "d3.min.js"),
  join(destination, "d3.min.js"),
);
await cp(
  join(dirname(require.resolve("markmap-view")), "browser", "index.js"),
  join(destination, "markmap-view.js"),
);
console.log("Client toolkit assets prepared locally.");
