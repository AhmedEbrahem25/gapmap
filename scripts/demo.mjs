#!/usr/bin/env node
/**
 * npm run demo — run GapMap the fast way (production build), on any OS.
 *
 * 1. Creates SESSION_SECRET in .env.local the first time (production needs one).
 * 2. Builds only when the code changed since the last build (e.g. after git pull).
 * 3. Starts the server and prints the links for this computer and for phones on the same Wi-Fi.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const port = process.env.PORT ?? "3000";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

/* 1 · session secret */
const envFile = path.join(root, ".env.local");
const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
if (!/^SESSION_SECRET=.{32,}/m.test(env)) {
  const line = `SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}\n`;
  fs.writeFileSync(envFile, env + (env && !env.endsWith("\n") ? "\n" : "") + line);
  console.log("✔ Added SESSION_SECRET to .env.local");
}

/* 2 · build when needed */
function newestMtime(p) {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const f of fs.readdirSync(p)) max = Math.max(max, newestMtime(path.join(p, f)));
  return max;
}
const buildId = path.join(root, ".next", "BUILD_ID");
const builtAt = fs.existsSync(buildId) ? fs.statSync(buildId).mtimeMs : 0;
const changedAt = Math.max(
  ...["src", "public", "drizzle", "package.json", "package-lock.json", "next.config.ts", ".env.local"].map((p) => newestMtime(path.join(root, p))),
);
if (!builtAt || changedAt > builtAt) {
  console.log("⏳ Building the fast version (one minute or two, only after updates)…");
  const r = spawnSync(process.execPath, [nextBin, "build"], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (r.status !== 0) process.exit(r.status ?? 1);
} else {
  console.log("✔ Build is up to date");
}

/* 3 · start */
const lan = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => `http://${i.address}:${port}`);

const server = spawn(process.execPath, [nextBin, "start", "-p", port], { stdio: ["inherit", "pipe", "inherit"], env: { ...process.env, NODE_ENV: "production" } });
let announced = false;
server.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (!announced && /ready|started|Local:/i.test(String(chunk))) {
    announced = true;
    console.log("\n──────────────────────────────────────────────");
    console.log(`  GapMap is running (fast mode)`);
    console.log(`  This computer:  http://localhost:${port}`);
    for (const u of lan) console.log(`  Phone (same Wi-Fi): ${u}`);
    console.log("  Stop with Ctrl+C");
    console.log("──────────────────────────────────────────────\n");
  }
});
const stop = () => server.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
