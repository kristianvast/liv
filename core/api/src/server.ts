// Production entry: `bun src/server.ts`. Configuration comes from the environment (see
// core/.env.example).
import { drizzle } from "drizzle-orm/bun-sql";
import { type CoreDb, coreSchema } from "./db";
import { migrate } from "./migrate";
import { serveCore } from "./runtime";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

const db = drizzle(required("DATABASE_URL"), { schema: coreSchema }) as unknown as CoreDb;
if (process.env.CORE_MIGRATE_ON_START !== "false") {
  const { applied } = await migrate(db);
  if (applied.length > 0) console.log(`migrations applied: ${applied.join(", ")}`);
}

required("ELECTRIC_URL");
// A production API without email would let accounts sign up that can never verify or reset;
// set MAIL_PROVIDER=log explicitly to run without real email (local compose stacks).
required("MAIL_PROVIDER");
const server = serveCore(db, 8080);

// Cloud Run sends SIGTERM about ten seconds before it removes an instance. Stop taking new
// requests, let the ones in flight finish, and leave before the hard kill; calls and phone
// sockets still open then are closed, and their clients reconnect to another instance.
process.on("SIGTERM", () => {
  setTimeout(() => process.exit(0), 8000).unref();
  void server.stop().finally(() => process.exit(0));
});
