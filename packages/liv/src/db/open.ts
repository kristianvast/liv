import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { animals, farms } from "@liv/schema";
import { migrate, openLocalDb } from "@liv/schema/local";
import { seedDemoFarm } from "@liv/schema/seed";
import { count } from "drizzle-orm";
import { Repository } from "./repo";

export interface OpenedDb {
  repo: Repository;
  seeded: boolean;
  close(): void;
}

/** Stable per-install node id (used as HLC node and origin_device). No ':' allowed. */
export function readInstallId(dataDir: string): string {
  const file = join(dataDir, "install-id");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const id = `liv-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  writeFileSync(file, id);
  return id;
}

/** Installs from before the Liv rename keep their database as orbit.sqlite (+ -wal/-shm). */
function adoptLegacyDatabase(dataDir: string) {
  const file = join(dataDir, "liv.sqlite");
  const legacy = join(dataDir, "orbit.sqlite");
  if (existsSync(file) || !existsSync(legacy)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(legacy + suffix)) renameSync(legacy + suffix, file + suffix);
  }
}

/** installId: the install's id when the database is in a farm folder below the data folder. */
export function openDatabase(
  dataDir: string,
  options: { seed: boolean; installId?: string },
): OpenedDb {
  mkdirSync(dataDir, { recursive: true });
  adoptLegacyDatabase(dataDir);
  const db = openLocalDb(join(dataDir, "liv.sqlite"));
  migrate(db);
  const repo = new Repository(db, options.installId ?? readInstallId(dataDir));
  let seeded = false;
  if (options.seed) {
    const empty =
      (db.select({ n: count() }).from(farms).get()?.n ?? 0) === 0 &&
      (db.select({ n: count() }).from(animals).get()?.n ?? 0) === 0;
    if (empty) seeded = seedDemoFarm(db).created;
  }
  // close(true) finalizes cached statements and closes now; the default defers the close and
  // keeps liv.sqlite (+ -wal/-shm) open, which locks the data folder on Windows.
  return { repo, seeded, close: () => db.$client.close(true) };
}
