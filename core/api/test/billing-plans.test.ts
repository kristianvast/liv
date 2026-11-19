import { expect, test } from "bun:test";
import { billingFixture } from "./billing-fixture";

const { app, headers } = billingFixture();
const catalog = [
  { id: "free", name: "Free", cameras: 0, monthly: 0, yearly: 0, livTokens: 0, voiceMinutes: 0 },
  {
    id: "orion",
    name: "Liv",
    cameras: 0,
    monthly: 20,
    yearly: 200,
    livTokens: 10_000_000,
    voiceMinutes: 60,
  },
  {
    id: "cam2",
    name: "2 cameras",
    cameras: 2,
    monthly: 47,
    yearly: 470,
    livTokens: 15_000_000,
    voiceMinutes: 120,
  },
  {
    id: "cam4",
    name: "4 cameras",
    cameras: 4,
    monthly: 75,
    yearly: 750,
    livTokens: 25_000_000,
    voiceMinutes: 200,
  },
  {
    id: "cam6",
    name: "6 cameras",
    cameras: 6,
    monthly: 95,
    yearly: 950,
    livTokens: 40_000_000,
    voiceMinutes: 300,
  },
  {
    id: "cam8",
    name: "8 cameras",
    cameras: 8,
    monthly: 111,
    yearly: 1110,
    livTokens: 50_000_000,
    voiceMinutes: 400,
  },
  {
    id: "cam12",
    name: "12 cameras",
    cameras: 12,
    monthly: 137,
    yearly: 1370,
    livTokens: 70_000_000,
    voiceMinutes: 560,
  },
  {
    id: "cam16",
    name: "16 cameras",
    cameras: 16,
    monthly: 155,
    yearly: 1550,
    livTokens: 90_000_000,
    voiceMinutes: 700,
  },
] as const;

test.each([undefined, "Bearer unknown", "Bearer orb_s_unknown", "Bearer legacy-farm-token"])(
  "plans return the complete EUR catalog publicly without requiring a session (%s)",
  async (authorization) => {
    const response = await app().request("/v1/billing/plans", {
      headers: { origin: "http://localhost:3000", ...(authorization ? { authorization } : {}) },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(await response.json()).toEqual({
      currency: "eur",
      currencies: ["eur", "nok"],
      locked: false,
      trialDays: 30,
      plans: catalog,
      hardware: [
        { id: "box", name: "Agrointel box", price: 920 },
        { id: "camera", name: "Tested camera", price: 150 },
      ],
    });
  },
);

test("a signed-in account receives the same EUR catalog without a farm header", async () => {
  const response = await app().request("/v1/billing/plans", {
    headers: { authorization: headers().authorization },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    currency: "eur",
    currencies: ["eur", "nok"],
    locked: false,
    trialDays: 30,
    plans: catalog,
    hardware: [
      { id: "box", name: "Agrointel box", price: 920 },
      { id: "camera", name: "Tested camera", price: 150 },
    ],
  });
});

test("NOK catalog returns fixed kroner prices for every term and hardware item", async () => {
  const response = await app().request("/v1/billing/plans?currency=nok");
  const data = await response.json();
  const monthly = [0, 229, 549, 879, 1099, 1299, 1599, 1799];
  expect(data).toMatchObject({
    currency: "nok",
    currencies: ["eur", "nok"],
    plans: catalog.map((p, i) => ({
      id: p.id,
      monthly: monthly[i],
      yearly: (monthly[i] ?? 0) * 10,
    })),
    hardware: [
      { id: "box", price: 10790 },
      { id: "camera", price: 1749 },
    ],
  });
});

test("unsupported catalog currency is not silently quoted in euros", async () => {
  expect((await app().request("/v1/billing/plans?currency=usd")).status).toBe(400);
});
