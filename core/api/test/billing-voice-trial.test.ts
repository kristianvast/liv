import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { farmSubscriptions, users, voiceUsage } from "../src/db";
import { createVoiceGateway, type VoiceConnection } from "../src/voice";
import { billingFixture, FARM, NOW } from "./billing-fixture";

const { db, headers, session } = billingFixture();

test.each([
  { name: "a verified signup alone lacks voice access", trial: false, usedAt: NOW, status: 402 },
  {
    name: "a paid trial grants a fresh voice pool each calendar month",
    trial: true,
    usedAt: new Date("2026-10-31T23:59:59Z"),
    status: 426,
  },
  {
    name: "a paid trial cannot exceed the plan's monthly voice allowance",
    trial: true,
    usedAt: NOW,
    status: 429,
  },
])("$name", async ({ trial, usedAt, status }) => {
  await db
    .update(users)
    .set({ createdAt: "2026-10-20T12:00:00Z" })
    .where(eq(users.id, session.userId));
  if (trial) {
    await db.insert(farmSubscriptions).values({ farmId: FARM, plan: "orion", status: "trialing" });
    await db.insert(voiceUsage).values({
      farmId: FARM,
      accountId: FARM,
      model: "live",
      seconds: 3600,
      createdAt: usedAt.toISOString(),
    });
  }
  const gateway = createVoiceGateway(db, {
    now: () => NOW,
    accessToken: async () => {
      throw new TypeError("Must not reach Vertex");
    },
  });
  const server = Bun.serve<VoiceConnection>({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("unused"),
    websocket: gateway.websocket,
  });
  try {
    const response = await gateway.upgrade(
      new Request("http://localhost/v1/voice/live", {
        headers: headers(),
      }),
      server,
    );
    expect(response?.status).toBe(status);
    if (status === 402)
      expect(await response?.json()).toMatchObject({ error: { code: "plan_required" } });
    if (status === 429)
      expect(await response?.json()).toMatchObject({ error: { code: "budget_exceeded" } });
  } finally {
    await server.stop(true);
  }
});
