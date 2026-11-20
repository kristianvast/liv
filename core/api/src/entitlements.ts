import { and, eq, gte, sql } from "drizzle-orm";
import { subscriptionFor } from "./billing-subscription";
import { type CoreDb, farmBudgets, llmUsage, voiceUsage } from "./db";
import { planFor } from "./plans";

export const PLAN_REQUIRED = {
  error: {
    code: "plan_required",
    message:
      "Liv cloud needs a plan. Choose a plan (30 days free with a card for new subscribers), or add your own model key in Settings.",
  },
} as const;

export function monthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export type BillingAccount = {
  readonly kind: "farm" | "personal";
  readonly id: string;
};

export async function entitlements(db: CoreDb, farmId: string, now: Date) {
  const subscription = await subscriptionFor(db, farmId);
  const active =
    subscription?.plan !== "free" &&
    (subscription?.status === "active" || subscription?.status === "trialing");
  const plan = planFor(active ? subscription.plan : "free");
  const [override] = await db.select().from(farmBudgets).where(eq(farmBudgets.farmId, farmId));
  return {
    subscription,
    plan,
    usageStart: monthStart(now),
    tokenAllowance: override?.monthlyTokenBudget ?? plan.livTokens,
    voiceSecondsAllowance: plan.voiceMinutes * 60,
  };
}

export async function usageThisMonth(db: CoreDb, accountId: string, window: Date | string) {
  const since = typeof window === "string" ? window : monthStart(window);
  const [[tokens], [voice]] = await Promise.all([
    db
      .select({ used: sql<string>`coalesce(sum(${llmUsage.totalTokens}), 0)` })
      .from(llmUsage)
      .where(and(eq(llmUsage.accountId, accountId), gte(llmUsage.createdAt, since))),
    db
      .select({ used: sql<string>`coalesce(sum(${voiceUsage.seconds}), 0)` })
      .from(voiceUsage)
      .where(and(eq(voiceUsage.accountId, accountId), gte(voiceUsage.createdAt, since))),
  ]);
  return { tokensUsed: Number(tokens?.used ?? 0), voiceSecondsUsed: Number(voice?.used ?? 0) };
}
