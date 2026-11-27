/**
 * Measures how well GapMap reads real marked papers, using the CC BY 4.0 dataset
 * "A Dataset of Digitized Student Examination Papers, Answer Keys, and Manual Evaluations"
 * (Mendeley Data, doi:10.17632/sf3kvjwknt.1): 20 MCQs + 15 short answers, marked by hand.
 *
 * Usage (the dataset is not committed; download it first):
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/eval-mark-reading.ts <dataset-dir> [papers=5]
 * <dataset-dir> holds Question.txt, answerkey.txt, Teacher_manual_marks_Anonymized.csv and corrected/Student_N.pdf.
 */
import fs from "node:fs";
import path from "node:path";
import { transcribePaper } from "../src/lib/ai/pipelines";
import { parseChoice, scoreChoice } from "../src/lib/mcq";

const dir = process.argv[2];
const count = Number(process.argv[3] ?? 5);
if (!dir) throw new Error("Pass the dataset folder");

// Questions: "N. text" lines, MCQ options as "A. text" lines. MCQs are worth 1 mark, short answers 2.
const questions: { number: number; prompt: string; maxMarks: number; kind: "written" | "mcq" }[] = [];
for (const line of fs.readFileSync(path.join(dir, "Question.txt"), "utf8").split(/\r?\n/)) {
  const q = line.match(/^(\d+)\.\s+(.*)$/);
  if (q) questions.push({ number: Number(q[1]), prompt: q[2]!.trim(), maxMarks: Number(q[1]) <= 20 ? 1 : 2, kind: Number(q[1]) <= 20 ? "mcq" : "written" });
}
const key = new Map(
  fs
    .readFileSync(path.join(dir, "answerkey.txt"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^(\d+),MCQ,([A-E])/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => [Number(m[1]), m[2]!]),
);

// Ground truth per student: letters for Q1–20, the lecturer's marks for Q21–35 (blank = no mark).
const rows = fs.readFileSync(path.join(dir, "Teacher_manual_marks_Anonymized.csv"), "utf8").trim().split(/\r?\n/);
const header = rows[0]!.split(",");
const truth = new Map(
  rows.slice(1).map((r) => {
    const cells = r.split(",");
    return [cells[0]!, Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]))] as const;
  }),
);

async function main() {
let mcqRight = 0, mcqTotal = 0, markRight = 0, markClose = 0, markTotal = 0, flagged = 0;
const totals: string[] = [];
for (let n = 1; n <= count; n++) {
  const id = `Student_${n}`;
  const file = path.join(dir, "corrected", `${id}.pdf`);
  const t = truth.get(id);
  if (!fs.existsSync(file) || !t) continue;
  const started = Date.now();
  const { answers, model } = await transcribePaper({ mediaType: "application/pdf", base64: fs.readFileSync(file).toString("base64") }, questions);
  let mcqScore = 0;
  const misses: string[] = [];
  for (const q of questions) {
    const read = answers.find((a) => a.number === q.number);
    const want = t[String(q.number)] ?? "";
    if (q.kind === "mcq") {
      if (!want) continue;
      mcqTotal++;
      const got = parseChoice(read?.text ?? "");
      if (got === want) mcqRight++;
      else misses.push(`Q${q.number} letter ${got ?? "—"}≠${want}`);
      mcqScore += scoreChoice(got, key.get(q.number) ?? null, 1);
    } else {
      if (want === "") continue; // not answered or not marked
      markTotal++;
      const got = read?.mark ?? null;
      if (got !== null && Math.abs(got - Number(want)) < 0.01) markRight++;
      else misses.push(`Q${q.number} mark ${got ?? "—"}≠${want}`);
      if (got !== null && Math.abs(got - Number(want)) <= 0.5) markClose++;
      if (read && (read.mark === null || read.markConfidence < 0.7)) flagged++;
    }
  }
  totals.push(`${id}: MCQ by rules ${mcqScore} vs lecturer ${t["MCQ mark"]}`);
  console.log(`${id} (${model}, ${Math.round((Date.now() - started) / 1000)}s): ${misses.length ? misses.join(", ") : "all correct"}`);
}
const p = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}% (${a}/${b})` : "—");
console.log("\nMCQ letters read correctly:", p(mcqRight, mcqTotal));
console.log("Lecturer marks read exactly:", p(markRight, markTotal), "· within 0.5:", p(markClose, markTotal));
console.log("Short answers flagged for a look (mark missing or unclear):", flagged);
console.log(totals.join("\n"));
}

main();
