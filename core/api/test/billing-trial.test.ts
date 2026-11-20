import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { farmBudgets, farmSubscriptions, llmUsage, users } from "../src/db";
import { subscription, webhook } from "./billing-events";
import { billingFixture, FARM, NOW } from "./billing-fixture";
import { stripeFake } from "./billing-stripe";

const { app, db, headers, session } = billingFixture();
const trialEnd = Date.parse("2026-12-06T12:00:00Z") / 1000;

const checkout = (a: ReturnType<typeof app>) =>
  a.request("/v1/billing/checkout", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ plan: "cam2", interval: "month" }),
  });

test.each([null, "active", "trialing", "canceled"])(
  "Checkout only offers a card-required trial without subscription history (%s)",
  async (status) => {
    if (status) await db.insert(farmSubscriptions).values({ farmId: FARM, plan: "orion", status });
    const forms: URLSearchParams[] = [];
    expect((await checkout(app({ fetch: stripeFake(forms) }))).status).toBe(200);
    expect(forms[0]?.get("subscription_data[trial_period_days]")).toBe(status ? null : "30");
    expect(forms[0]?.get("payment_method_collection")).toBe(status ? null : "always");
    expect(forms[0]?.get("payment_method_types[0]")).toBe(status ? null : "card");
  },
);

test("Checkout supersedes an open trial and checks Stripe for subscriptions before the webhook", async () => {
  const forms: URLSearchParams[] = [];
  const fallback = stripeFake(forms);
  const prior: { state: "open" | "expired" | "subscribed" } = { state: "open" };
  const a = app({
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/checkout/sessions" && init?.method === "GET") {
        expect(url.searchParams.get("status")).toBe("open");
        return Response.json({
          data:
            prior.state === "open" ? [{ id: "cs_previous", metadata: { liv_trial: "true" } }] : [],
        });
      }
      if (url.pathname === "/v1/checkout/sessions/cs_previous/expire") {
        prior.state = "expired";
        return Response.json({ status: "expired" });
      }
      if (url.pathname === "/v1/subscriptions") {
        expect(url.searchParams.get("status")).toBe("all");
        return Response.json({ data: prior.state === "subscribed" ? [{ id: "sub_prior" }] : [] });
      }
      return fallback(input, init);
    },
  });
  expect((await checkout(a)).status).toBe(200);
  expect(prior.state).toBe("expired");
  expect(forms[0]?.get("subscription_data[trial_period_days]")).toBe("30");
  prior.state = "subscribed";
  expect((await checkout(a)).status).toBe(200);
  expect(forms[1]?.has("subscription_data[trial_period_days]")).toBe(false);
});

test("Stripe trial_end is reported only while the paid subscription is trialing", async () => {
  const a = app();
  const status = () => a.request("/v1/billing/status", { headers: headers() });
  const value = { ...subscription, status: "trialing", trial_end: trialEnd };
  expect((await webhook(a, { value })).status).toBe(200);
  expect(await (await status()).json()).toMatchObject({
    plan: "cam2",
    trialEndsAt: "2026-12-06T12:00:00.000Z",
    trialAvailable: false,
    status: "trialing",
    usage: { tokenAllowance: 15_000_000, voiceSecondsAllowance: 7200 },
    farm: { trialEndsAt: "2026-12-06T12:00:00.000Z", trialAvailable: false },
    personal: { trialEndsAt: null, trialAvailable: true },
  });
  expect(
    (await webhook(a, { id: "evt_active", value: { ...value, status: "active" } })).status,
  ).toBe(200);
  expect(await (await status()).json()).toMatchObject({
    plan: "cam2",
    trialEndsAt: null,
    trialAvailable: false,
    status: "active",
  });
});

test("a fresh verified signup is eligible for Checkout but gets no cloud allowance", async () => {
  await db.update(users).set({ createdAt: NOW.toISOString() }).where(eq(users.id, session.userId));
  const a = app();
  const status = await a.request("/v1/billing/status", { headers: headers() });
  expect(status.status).toBe(200);
  expect(await status.json()).toMatchObject({
    plan: "free",
    trialEndsAt: null,
    trialAvailable: true,
    usage: { tokenAllowance: 0, voiceSecondsAllowance: 0 },
  });
  const response = await a.request("/v1/llm/v1/chat/completions", {
    method: "POST",
    headers: headers(),
    body: "{}",
  });
  expect(response.status).toBe(402);
  expect(await response.json()).toMatchObject({ error: { code: "plan_required" } });
});

test("a trialing paid plan counts LLM usage from the UTC month start", async () => {
  const a = app({
    fetch: async () => Response.json({ usage: { total_tokens: 11, prompt_tokens: 6 } }),
  });
  expect(
    (await webhook(a, { value: { ...subscription, status: "trialing", trial_end: trialEnd } }))
      .status,
  ).toBe(200);
  await db.insert(llmUsage).values({
    farmId: FARM,
    accountId: FARM,
    path: "/x",
    status: 200,
    totalTokens: 15_000_000,
    createdAt: "2026-10-31T23:59:59Z",
  });
  const response = await a.request("/v1/llm/v1/chat/completions", {
    method: "POST",
    headers: headers(),
    body: '{"model":"liv-default"}',
  });
  expect(response.status).toBe(200);
  const status = await a.request("/v1/billing/status", { headers: headers() });
  expect(await status.json()).toMatchObject({ usage: { tokensUsed: 11 } });
});

test("a farm budget override still grants model access without a plan", async () => {
  await db.insert(farmBudgets).values({ farmId: FARM, monthlyTokenBudget: 123 });
  const response = await app({
    fetch: async () => Response.json({ usage: { total_tokens: 1 } }),
  }).request("/v1/llm/v1/chat/completions", { method: "POST", headers: headers(), body: "{}" });
  expect(response.status).toBe(200);
});

test("a zero budget override exhausts a paid plan's allowance", async () => {
  await db.insert(farmSubscriptions).values({ farmId: FARM, plan: "cam2", status: "active" });
  await db.insert(farmBudgets).values({ farmId: FARM, monthlyTokenBudget: 0 });
  const response = await app().request("/v1/llm/v1/chat/completions", {
    method: "POST",
    headers: headers(),
    body: "{}",
  });
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ error: { code: "budget_exceeded", budget: 0 } });
});
