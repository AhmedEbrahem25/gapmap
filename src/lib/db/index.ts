import "server-only";
import path from "node:path";
import { loadSqlJs, openDatabase, hasSchema, type AppDb, type Handle } from "./sqlite";
import * as schema from "./schema";
import { seed } from "../../../scripts/seed";

const dbPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_PATH ?? "data/gapmap.db");
const migrations = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

// sql.js loads its WebAssembly once per process.
const SQL = await loadSqlJs();

declare global {
  var __gapmapDb: Handle | undefined;
}

function connect(): Handle {
  // First run on a fresh clone (or an empty file): build the schema and load the demo data.
  if (!hasSchema(SQL, dbPath)) seed(SQL, dbPath);
  return openDatabase(SQL, dbPath, migrations);
}

/** One in-memory copy per process, shared by every route, action and background job. */
function handle(): Handle {
  globalThis.__gapmapDb ??= connect();
  return globalThis.__gapmapDb;
}

export function resetDatabase() {
  globalThis.__gapmapDb?.close();
  globalThis.__gapmapDb = undefined;
  seed(SQL, dbPath);
  return handle().db;
}

/** Proxy so `db.select()…` always hits the live connection (survives a demo reset). */
export const db = new Proxy({} as AppDb, {
  get(_t, prop) {
    const real = handle().db as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
