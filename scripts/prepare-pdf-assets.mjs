import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdir, cp } from "node:fs/promises";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const { version } = require("pdfjs-dist/package.json");
const destination = join(process.cwd(), "public", "pdfjs", version);
await mkdir(destination, { recursive: true });
await Promise.all([
  cp(
    join(root, "build", "pdf.worker.min.mjs"),
    join(destination, "pdf.worker.min.mjs"),
  ),
  cp(join(root, "cmaps"), join(destination, "cmaps"), { recursive: true }),
  cp(join(root, "standard_fonts"), join(destination, "standard_fonts"), {
    recursive: true,
  }),
]);
console.log(`PDF assets prepared locally (${version}).`);
