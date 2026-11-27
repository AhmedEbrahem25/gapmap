/**
 * SQLite without native modules: sql.js (SQLite compiled to WebAssembly)
 * runs in memory and is written back to a file after every change.
 * Works on any OS with a plain `npm install` — no Visual Studio, no Python.
 *
 * Shared by the app (src/lib/db/index.ts) and the seed script, so it must
 * not import "server-only".
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Database, SqlJsStatic } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import { migrate } from "drizzle-orm/sql-js/migrator";
import * as schema from "./schema";

export type AppDb = SQLJsDatabase<typeof schema>;

let sqlModule: Promise<SqlJsStatic> | undefined;

/** Loads the WebAssembly build with the .wasm inlined, so bundlers never need to find a file. */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlModule) {
    // Resolve from the project root so this works under Next.js and under tsx alike.
    const require = createRequire(path.join(/*turbopackIgnore: true*/ process.cwd(), "package.json"));
    const init = require("sql.js/dist/sql-wasm-inline.js") as (cfg?: object) => Promise<SqlJsStatic>;
    sqlModule = init();
  }
  return sqlModule;
}

const READ_ONLY = /^\s*(select|pragma|with\s[\s\S]*?\bselect\b|explain)/i;

export type Handle = { db: AppDb; client: Database; file: string; flush: () => void; close: () => void };

/** Opens (or creates) the database file and keeps it in sync with the in-memory copy. */
export function openDatabase(SQL: SqlJsStatic, file: string, migrationsFolder: string): Handle {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = fs.existsSync(file) ? fs.readFileSync(file) : undefined;
  const client = new SQL.Database(bytes && bytes.length ? new Uint8Array(bytes) : undefined);
  client.run("PRAGMA foreign_keys = ON");

  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!dirty || closed) return;
    dirty = false;
    const data = client.export(); // export re-opens the db, which resets pragmas
    client.run("PRAGMA foreign_keys = ON");
    const tmp = `${file}.tmp`;
    try {
      fs.writeFileSync(tmp, Buffer.from(data));
      try {
        fs.renameSync(tmp, file);
      } catch {
        // Windows: a virus scanner or indexer can hold the file for a moment; overwrite it in place instead.
        fs.copyFileSync(tmp, file);
        fs.rmSync(tmp, { force: true });
      }
    } catch (err) {
      // The in-memory copy stays the truth; try saving again shortly rather than failing the request.
      console.warn("GapMap: saving the database failed, retrying", (err as Error).message);
      dirty = true;
      timer ??= setTimeout(flush, 500);
    }
  };

  const markDirty = () => {
    dirty = true;
    // Writes run synchronously inside a request or transaction; save once they settle.
    if (!timer) timer = setTimeout(flush, 25);
  };

  const prepare = client.prepare.bind(client);
  client.prepare = ((sql: string, params?: never) => {
    if (!READ_ONLY.test(sql)) markDirty();
    return prepare(sql, params);
  }) as Database["prepare"];
  const run = client.run.bind(client);
  client.run = ((sql: string, params?: never) => {
    if (!READ_ONLY.test(sql)) markDirty();
    return run(sql, params);
  }) as Database["run"];
  const exec = client.exec.bind(client);
  client.exec = ((sql: string, params?: never) => {
    if (!READ_ONLY.test(sql)) markDirty();
    return exec(sql, params);
  }) as Database["exec"];

  const db = drizzle(client, { schema });
  migrate(db, { migrationsFolder });
  flush();

  return {
    db,
    client,
    file,
    flush,
    close: () => {
      flush();
      closed = true;
      client.close();
    },
  };
}

export function hasSchema(SQL: SqlJsStatic, file: string) {
  if (!fs.existsSync(file)) return false;
  const bytes = fs.readFileSync(file);
  if (!bytes.length) return false;
  try {
    const probe = new SQL.Database(new Uint8Array(bytes));
    const rows = probe.exec("select 1 from sqlite_master where type = 'table' and name = 'users'");
    probe.close();
    return rows.length > 0;
  } catch {
    return false;
  }
}
