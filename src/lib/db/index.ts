import "server-only";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { seed } from "../../../scripts/seed";

const dbPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_PATH ?? "data/gapmap.db");

declare global {
  var __gapmapDb: BetterSQLite3Database<typeof schema> | undefined;
}

function connect() {
  // First run on a fresh clone (or an empty file): build the schema and load the demo data.
  if (!fs.existsSync(dbPath) || !hasSchema()) seed(dbPath);
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(/*turbopackIgnore: true*/ process.cwd(), "drizzle") });
  return db;
}

function hasSchema() {
  const probe = new Database(dbPath, { readonly: true });
  try {
    return !!probe.prepare("select 1 from sqlite_master where type = 'table' and name = 'users'").get();
  } finally {
    probe.close();
  }
}

export function resetDatabase() {
  const current = globalThis.__gapmapDb;
  if (current) (current as unknown as { $client: Database.Database }).$client.close();
  globalThis.__gapmapDb = undefined;
  seed(dbPath);
  globalThis.__gapmapDb = connect();
  return globalThis.__gapmapDb;
}

export function getDb() {
  if (!globalThis.__gapmapDb) globalThis.__gapmapDb = connect();
  return globalThis.__gapmapDb;
}

/** Proxy so `db.select()...` always hits the live connection (survives a demo reset). */
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
