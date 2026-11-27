// Read-only smoke test: signs in as each demo account and opens every reachable page.
// Usage: BASE=https://your-site npm run smoke   (MOBILE=1 for a phone-sized screen; PW_CHANNEL=msedge or chrome)
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3000";
const accounts = [null, "Dr. Karim Nour", "Mariam Adel", "Nada Lotfy", "Dr. Hany Fawzy",
  { email: "admin@gapmap.demo" }, { email: "youssef.kamal@student.gapmap.demo" }, { email: "salma.ibrahim@student.gapmap.demo" }];
const pattern = (p) => p.replace(/[a-z]{3}_[A-Za-z0-9_-]{8,}/g, ":id");
const problems = [];
let visited = 0;
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL });
for (const acc of accounts) {
  const ctx = await browser.newContext(process.env.MOBILE ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } : {});
  const page = await ctx.newPage();
  const label = acc === null ? "anonymous" : typeof acc === "string" ? acc : acc.email;
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|hmr/i.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
  let start = "/";
  if (acc) {
    await page.goto(BASE + "/login");
    if (typeof acc === "string") await page.getByRole("button", { name: new RegExp(acc.replace(".", "\.")) }).click();
    else { await page.fill("input[name=email]", acc.email); await page.fill("input[name=password]", "GapMap@2026"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); }
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => problems.push(`[${label}] login failed`));
    start = new URL(page.url()).pathname;
  }
  const queue = [start, "/login"]; const seen = new Set(); const perPattern = {};
  while (queue.length && seen.size < 160) {
    const path = queue.shift();
    if (seen.has(path)) continue; seen.add(path);
    const pat = pattern(path.split("?")[0]);
    perPattern[pat] = (perPattern[pat] ?? 0) + 1;
    if (perPattern[pat] > 3) continue;
    errs.length = 0;
    let status = 0;
    try {
      const res = await page.goto(BASE + path, { waitUntil: "load", timeout: 30000 });
      status = res?.status() ?? 0;
      await page.waitForTimeout(250);
    } catch (e) { problems.push(`[${label}] ${path} -> ${e.message.split("\n")[0]}`); continue; }
    visited++;
    const finalPath = new URL(page.url()).pathname;
    const text = await page.locator("body").innerText().catch(() => "");
    if (status >= 400 && !path.startsWith("/api/")) problems.push(`[${label}] ${path} -> HTTP ${status}`);
    if (/Something went wrong|couldn.t find that page|Application error/i.test(text)) problems.push(`[${label}] ${path} -> error page (${finalPath})`);
    if (acc && finalPath === "/login" && path !== "/login") problems.push(`[${label}] ${path} -> bounced to login`);
    for (const e of errs) problems.push(`[${label}] ${path} -> ${e}`);
    if (process.env.MOBILE) { const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (ov > 2) problems.push(`[${label}] ${pattern(path)} -> horizontal scroll ${ov}px`); }
    const links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    for (const h of links) {
      if (!h || !h.startsWith("/") || h.startsWith("//") || h.startsWith("/api/export")) continue;
      if (!seen.has(h)) queue.push(h);
    }
  }
  console.log(`${label}: ${seen.size} urls`);
  await ctx.close();
}
await browser.close();
console.log(`\nvisited ${visited} pages, ${problems.length} problems`);
for (const p of [...new Set(problems)]) console.log(" - " + p);
process.exit(problems.length ? 1 : 0);
