// Applies the @liv/schema Postgres migrations (synced tables) and then core/api/migrations
// (Core-only tables). Idempotent; applied tags are tracked in __core_migrations.
import { readdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { type CoreDb, coreMigrations } from "./db";

interface Migration {
  tag: string;
  file: URL;
}

const SCHEMA_PG_DIR = new URL("../drizzle/pg/", import.meta.resolve("@liv/schema/pg"));
const CORE_DIR = new URL("../migrations/", import.meta.url);

async function listMigrations(): Promise<Migration[]> {
  const journal = (await Bun.file(new URL("meta/_journal.json", SCHEMA_PG_DIR)).json()) as {
    entries: { tag: string }[];
  };
  const schema = journal.entries.map((e) => ({
    tag: `schema/${e.tag}`,
    file: new URL(`${e.tag}.sql`, SCHEMA_PG_DIR),
  }));
  const core = (await readdir(CORE_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ tag: `core/${f.replace(/\.sql$/, "")}`, file: new URL(f, CORE_DIR) }));
  return [...schema, ...core];
}

export async function migrate(db: CoreDb): Promise<{ applied: string[] }> {
  const migrations = await listMigrations();
  // Several instances start together when the service scales out or rolls a new revision. The
  // lock makes them take turns, and each reads what is already applied only once it holds the
  // lock, so no migration runs twice.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('liv-core-migrations'))`);
    await tx.execute(
      sql`CREATE TABLE IF NOT EXISTS "__core_migrations" ("tag" text PRIMARY KEY NOT NULL, "applied_at" timestamp with time zone DEFAULT now() NOT NULL)`,
    );
    const done = new Set((await tx.select().from(coreMigrations)).map((r) => r.tag));
    const applied: string[] = [];
    for (const m of migrations) {
      if (done.has(m.tag)) continue;
      const statements = (await Bun.file(m.file).text())
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of statements) await tx.execute(sql.raw(s));
      await tx.insert(coreMigrations).values({ tag: m.tag });
      applied.push(m.tag);
    }
    return { applied };
  });
}
