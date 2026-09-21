import { readFile } from "node:fs/promises";
import { planPaste } from "../lib/smart-paste.js";
import { segment } from "../lib/segment.js";

const text = await readFile(new URL("../sample/resume.txt", import.meta.url), "utf8");
const seg = segment(text);
console.log(`--- tagged (${seg.lines.length} lines, ${seg.blocks.length} blocks) ---`);
console.log(seg.tagged);

const t0 = Date.now();
const plan = await planPaste({ text, targetField: "full_name" });
console.log(`\n--- plan (${plan.mode}, gate=${plan.gate?.toFixed(2)}, ${Date.now() - t0}ms, ${plan.usage?.input_tokens} in tokens) ---`);
for (const f of plan.fills) {
  const v = f.value.length > 70 ? f.value.slice(0, 67).replace(/\n/g, " ⏎ ") + "…" : f.value.replace(/\n/g, " ⏎ ");
  console.log(`${f.status.padEnd(6)} ${f.label.padEnd(48)} ${f.source.padEnd(6)} p=${f.probability.toFixed(2)}  ${v}`);
}
for (const s of plan.skipped) {
  console.log(`skip   ${s.label.padEnd(48)} ${s.reason}${s.runnerUp ? ` (runner-up ${s.runnerUp} p=${s.runnerUpP.toFixed(2)}, none=${s.pNone.toFixed(2)})` : ""}`);
}

if (process.argv.includes("--extra")) {
  console.log("\n--- single value routed ---");
  console.log(JSON.stringify(await planPaste({ text: "(917) 555-0143", targetField: "full_name" }), null, 1));
  console.log("\n--- non-resume text ---");
  const junk = "The quick brown fox jumps over the lazy dog.\nInstall with npm install and run npm start.\nSee the docs for configuration options.";
  const p2 = await planPaste({ text: junk, targetField: "summary" });
  console.log(p2.mode, p2.gate?.toFixed(2), p2.reason);
}
