import { expect, jest, test } from "bun:test";
import { createLogMailer } from "../src/mailer";
import { object } from "../src/stripe";
import { subscription, webhook } from "./billing-events";
import { billingFixture, FARM } from "./billing-fixture";
import { stripeFake } from "./billing-stripe";
import { posthogSink } from "./posthog-fixture";

const { app, headers, session, db } = billingFixture();

test.each([
  { deviceName: "Liv on Test-PC", source: "app" },
  { deviceName: "Website", source: "web" },
  { deviceName: null, source: "web" },
  { deviceName: "Liv on ", source: "web" },
])("registration attributes $deviceName to $source with the created user ID", async (input) => {
  const sink = posthogSink();
  const response = await app({ ...sink, mailer: createLogMailer(() => {}) }).request(
    "/v1/auth/register",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "new@example.test",
        password: "correct horse battery",
        name: "Never sent",
        acceptTerms: true,
        deviceName: input.deviceName,
      }),
    },
  );
  expect(response.status).toBe(201);
  const user = object(object(await response.json()).user);
  expect(await sink.received).toMatchObject({
    batch: [
      {
        event: "account_created",
        distinct_id: user.id,
        properties: { source: input.source, method: "password", $geoip_disable: true },
      },
    ],
  });
  const batch = object(sink.bodies[0]).batch;
  expect(Array.isArray(batch) && object(batch[0]).properties).toEqual({
    source: input.source,
    method: "password",
    $geoip_disable: true,
  });
});

test.each([
  {
    path: "checkout",
    body: { plan: "orion", interval: "month", account: "personal" },
    plan: "orion",
    interval: "month",
    kind: "plan",
    account: "personal",
  },
  {
    path: "checkout",
    body: { plan: "cam2", interval: "year", box: 1, account: "farm" },
    plan: "cam2",
    interval: "year",
    kind: "both",
    account: "farm",
  },
  {
    path: "hardware-checkout",
    body: { cameras: 2 },
    plan: null,
    interval: null,
    kind: "hardware",
    account: "personal",
  },
])("successful $kind checkout emits its initiating user and billing choice", async (input) => {
  const sink = posthogSink(stripeFake([]));
  const response = await app(sink).request(`/v1/billing/${input.path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input.body),
  });
  expect(response.status).toBe(200);
  expect(await sink.received).toMatchObject({
    batch: [
      {
        event: "checkout_started",
        distinct_id: session.userId,
        properties: {
          plan: input.plan,
          interval: input.interval,
          kind: input.kind,
          account: input.account,
        },
      },
    ],
  });
});

test("a paid checkout emits after commit and a replay emits nothing", async () => {
  const sink = posthogSink(async () => Response.json(subscription));
  const a = app(sink);
  const value = {
    id: "cs_paid",
    mode: "subscription",
    payment_status: "paid",
    customer: "cus_test",
    subscription: "sub_test",
    metadata: { user_id: session.userId, farm_id: FARM, plan: "cam2", interval: "month" },
  };
  expect((await webhook(a, { type: "checkout.session.completed", value })).status).toBe(200);
  expect(await sink.received).toMatchObject({
    batch: [
      {
        event: "checkout_completed",
        distinct_id: session.userId,
        properties: { plan: "cam2", interval: "month", kind: "plan" },
      },
    ],
  });
  jest.useFakeTimers();
  try {
    expect((await webhook(a, { type: "checkout.session.completed", value })).status).toBe(200);
    jest.advanceTimersByTime(0);
    expect(sink.bodies).toHaveLength(1);
  } finally {
    jest.useRealTimers();
  }
});

test("delayed hardware payment emits only when it becomes paid", async () => {
  const sink = posthogSink();
  const a = app(sink);
  const value = {
    id: "cs_delayed",
    mode: "payment",
    payment_status: "unpaid",
    metadata: { user_id: session.userId, cameras: "2" },
  };
  jest.useFakeTimers();
  try {
    expect((await webhook(a, { type: "checkout.session.completed", value })).status).toBe(200);
    jest.advanceTimersByTime(0);
    expect(sink.bodies).toEqual([]);
  } finally {
    jest.useRealTimers();
  }
  expect(
    (
      await webhook(a, {
        id: "evt_async",
        type: "checkout.session.async_payment_succeeded",
        value: { ...value, payment_status: "paid" },
      })
    ).status,
  ).toBe(200);
  expect(await sink.received).toMatchObject({
    batch: [
      {
        event: "checkout_completed",
        distinct_id: session.userId,
        properties: { plan: null, interval: null, kind: "hardware" },
      },
    ],
  });
});

test.each(["unpaid", "no_payment_required"])(
  "a completed subscription checkout with %s does not count as paid",
  async (paymentStatus) => {
    const sink = posthogSink(async () => Response.json(subscription));
    jest.useFakeTimers();
    try {
      const response = await webhook(app(sink), {
        type: "checkout.session.completed",
        value: {
          mode: "subscription",
          payment_status: paymentStatus,
          customer: "cus_test",
          subscription: "sub_test",
          metadata: { user_id: session.userId, farm_id: FARM, plan: "cam2", interval: "month" },
        },
      });
      expect(response.status).toBe(200);
      jest.advanceTimersByTime(0);
      expect(sink.bodies).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  },
);

test("metered Liv requests emit the user's identity and actual model tokens status and plan", async () => {
  const { farmSubscriptions } = await import("../src/db");
  await db.insert(farmSubscriptions).values({ farmId: FARM, plan: "orion", status: "active" });
  const sink = posthogSink(async () =>
    Response.json({
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    }),
  );
  const response = await app(sink).request("/v1/llm/v1/chat/completions", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "Private" }] }),
  });
  expect(response.status).toBe(200);
  expect(await sink.received).toMatchObject({
    batch: [
      {
        event: "liv_request",
        distinct_id: session.userId,
        properties: {
          model: "test-model",
          input_tokens: 3,
          output_tokens: 4,
          status: 200,
          plan: "orion",
        },
      },
    ],
  });
});
