import { and, eq, gt, lte, sql } from "drizzle-orm";
import { hashToken } from "./auth";
import { type CoreDb, feedbackRateEvents } from "./db";
import { clientIp, visitorKey } from "./voice-demo";

type Tx = Parameters<Parameters<CoreDb["transaction"]>[0]>[0];

/**
 * Counts one event for `identity` and answers whether it is still within `max` per `windowMs`.
 * Events live in Postgres, so a limit holds across instances and restarts, and the lock makes
 * simultaneous requests for one identity take turns. A refused event is not counted.
 */
export async function withinRate(
  tx: Tx,
  identity: string,
  max: number,
  windowMs: number,
  at: Date,
): Promise<boolean> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identity}))`);
  const cutoff = new Date(at.getTime() - windowMs).toISOString();
  await tx
    .delete(feedbackRateEvents)
    .where(
      and(eq(feedbackRateEvents.identity, identity), lte(feedbackRateEvents.createdAt, cutoff)),
    );
  const [count] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(feedbackRateEvents)
    .where(
      and(eq(feedbackRateEvents.identity, identity), gt(feedbackRateEvents.createdAt, cutoff)),
    );
  if ((count?.n ?? 0) >= max) return false;
  await tx.insert(feedbackRateEvents).values({ identity, createdAt: at.toISOString() });
  return true;
}

/**
 * The caller's network address as a rate-limit identity (hashed, never stored raw), or null when
 * the request did not come through a proxy that names one: Cloud Run always does, a local or
 * test server does not, and there is then nobody to tell apart.
 */
export async function addressIdentity(
  scope: string,
  forwardedFor: string | undefined,
): Promise<string | null> {
  if (!forwardedFor) return null;
  return `${scope}:ip:${await hashToken(visitorKey(clientIp(forwardedFor)))}`;
}
