#!/usr/bin/env node
/**
 * After the capture runs: node capture/build.mjs <outDir>
 * → GapMap_Demo.mp4 (cinematic cut with score and sound effects, by cinema.py), GapMap_Screenshots.html/.pdf.
 * Needs ffmpeg on PATH (or FFMPEG=path), Python with numpy + scipy for the cinematic cut, and Microsoft Edge for the PDF.
 * SKIP_VIDEO=1 rebuilds only the screenshot book. Without Python, the video falls back to a plain silent encode.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const out = path.resolve(process.argv[2] ?? "capture/out");
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

/* 1 · video: the cinematic cut first, a plain silent encode if Python isn't there */
const concat = path.join(out, "frames.ffconcat");
const here = path.dirname(fileURLToPath(import.meta.url));
let cinematic = false;
if (fs.existsSync(concat) && !process.env.SKIP_VIDEO && fs.existsSync(path.join(out, "cues.json"))) {
  const py = spawnSync(process.env.PYTHON ?? "python", [path.join(here, "cinema.py"), out], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  cinematic = py.status === 0;
}
if (fs.existsSync(concat) && !process.env.SKIP_VIDEO && !cinematic) {
  const mp4 = path.join(out, "GapMap_Demo.mp4");
  const vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p";
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concat, "-vf", vf, "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log("✔", mp4);
}

/* 2 · captioned screenshot book */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const sections = [];
for (const [dir, title] of [["desktop", "Desktop (lecturer, student, coordinator)"], ["phone", "Phone (student)"]]) {
  const mf = path.join(out, dir, "manifest.json");
  if (!fs.existsSync(mf)) continue;
  const items = JSON.parse(fs.readFileSync(mf, "utf8"));
  sections.push(`<h2>${title}</h2>` + items.map((it, i) => `
    <figure class="${dir}"><figcaption><span class="n">${dir === "phone" ? "P" : ""}${i + 1}</span><span class="who">${esc(it.who)}</span>${esc(it.caption)}<code>${dir}/${it.file}</code></figcaption>
    <img src="${dir}/${it.file}" alt="${esc(it.caption)}"></figure>`).join(""));
}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>GapMap screenshots</title><style>
  @page{size:A4;margin:14mm}body{font:14px/1.45 'IBM Plex Sans',Segoe UI,system-ui,sans-serif;color:#1d1f33;margin:0 auto;max-width:980px;padding:24px}
  header{background:linear-gradient(135deg,#232A6B,#B51834);color:#fff;border-radius:14px;padding:28px 32px;margin-bottom:24px}
  header h1{margin:0 0 6px;font-size:34px}header p{margin:0;opacity:.9}
  h2{color:#232A6B;border-bottom:2px solid #B51834;padding-bottom:6px;margin-top:32px;break-before:page}h2:first-of-type{break-before:auto}
  figure{margin:0 0 26px;break-inside:avoid}figcaption{margin-bottom:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
  .n{background:#B51834;color:#fff;border-radius:999px;padding:1px 10px;font-weight:700}.who{font-weight:700;color:#232A6B}
  code{flex-basis:100%;color:#777;font-size:11px}img{display:block;max-width:100%;max-height:235mm;margin:0 auto;border:1px solid #ddd;border-radius:8px}
  figure.desktop{break-before:page}figure.desktop:first-of-type{break-before:auto}
  figure.phone{display:inline-block;width:31%;margin-right:2%;vertical-align:top}figure.phone img{max-height:120mm}figure.phone figcaption{font-size:12px;min-height:84px}
</style></head><body><header><h1>GapMap · screenshots</h1>
<p>AI Educathon 2026 · Genesis Team · every step of the prototype, lecturer → student → class decision. All data is fictional demo data; the AI never grades and no student data reaches the AI.</p></header>
${sections.join("")}</body></html>`;
const htmlFile = path.join(out, "GapMap_Screenshots.html");
fs.writeFileSync(htmlFile, html);
console.log("✔", htmlFile);

const edgeCandidates = [process.env.EDGE, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].filter(Boolean);
const edge = edgeCandidates.find((p) => fs.existsSync(p));
if (edge) {
  const pdf = path.join(out, "GapMap_Screenshots.pdf");
  spawnSync(edge, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, pathToFileURL(htmlFile).href], { stdio: "inherit" });
  if (fs.existsSync(pdf)) console.log("✔", pdf);
}
