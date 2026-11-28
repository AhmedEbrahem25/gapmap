import fs from "node:fs";

/** Fresh demo database for every capture run: the app seeds it on first request. */
export default function globalSetup() {
  for (const s of ["", "-wal", "-shm"]) fs.rmSync(`data/capture.db${s}`, { force: true });
}
