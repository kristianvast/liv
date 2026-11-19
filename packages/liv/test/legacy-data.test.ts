import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adoptLegacyDataDir } from "../src/config";
import { openDatabase } from "../src/db/open";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function animalCount(dir: string): number {
  const db = new Database(join(dir, "liv.sqlite"), { readonly: true });
  try {
    return (db.query("SELECT count(*) AS n FROM animals").get() as { n: number }).n;
  } finally {
    db.close();
  }
}

function legacyInstall(root: string): { dir: string; installId: string; animals: number } {
  const dir = join(root, "no.agrointel.orbit");
  openDatabase(dir, { seed: true }).close();
  const animals = animalCount(dir);
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = join(dir, `liv.sqlite${suffix}`);
    if (existsSync(file)) renameSync(file, join(dir, `orbit.sqlite${suffix}`));
  }
  return { dir, installId: readFileSync(join(dir, "install-id"), "utf8"), animals };
}

test("an updated install picks up its old data folder and database with every row", () => {
  const root = mkdtempSync(join(tmpdir(), "liv-legacy-"));
  roots.push(root);
  const old = legacyInstall(root);
  expect(old.animals).toBeGreaterThan(0);
  // The desktop shell creates the new, empty data folder before it starts the sidecar.
  const dir = join(root, "no.agrointel.liv");
  mkdirSync(dir);

  adoptLegacyDataDir(dir);
  const opened = openDatabase(dir, { seed: false });
  opened.close();

  expect(existsSync(old.dir)).toBe(false);
  expect(existsSync(join(dir, "orbit.sqlite"))).toBe(false);
  expect(animalCount(dir)).toBe(old.animals);
  expect(readFileSync(join(dir, "install-id"), "utf8")).toBe(old.installId);
});

test("a folder that already holds data, or another app's folder, is left alone", () => {
  const root = mkdtempSync(join(tmpdir(), "liv-legacy-"));
  roots.push(root);
  const old = legacyInstall(root);
  const dir = join(root, "no.agrointel.liv");
  mkdirSync(dir);
  writeFileSync(join(dir, "install-id"), "liv-already-here");
  adoptLegacyDataDir(dir);
  expect(existsSync(join(old.dir, "orbit.sqlite"))).toBe(true);

  const foreign = join(root, "Orbit");
  mkdirSync(foreign);
  writeFileSync(join(foreign, "settings.json"), "{}");
  adoptLegacyDataDir(join(root, "Liv"));
  expect(existsSync(join(foreign, "settings.json"))).toBe(true);
  expect(existsSync(join(root, "Liv"))).toBe(false);
});
