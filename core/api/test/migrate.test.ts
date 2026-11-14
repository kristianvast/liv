import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { type CoreDb, coreSchema } from "../src";
import { migrate } from "../src/migrate";

test("instances that start together apply each migration once", async () => {
  const client = new PGlite();
  try {
    const db = drizzle({ client, schema: coreSchema }) as unknown as CoreDb;
    const [first, second] = await Promise.all([migrate(db), migrate(db)]);
    const applied = [...first.applied, ...second.applied];
    expect(applied.length).toBeGreaterThan(0);
    expect(new Set(applied).size).toBe(applied.length);
    expect((await migrate(db)).applied).toEqual([]);
  } finally {
    await client.close();
  }
}, 60_000);
