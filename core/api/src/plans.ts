export const currencies = ["eur", "nok"] as const;
export type Currency = (typeof currencies)[number];
export const defaultCurrency = currencies[0];

function rates(eur: number, nok: number) {
  return { monthly: { eur, nok }, yearly: { eur: eur * 10, nok: nok * 10 } } as const;
}

export const plans = [
  { id: "free", name: "Free", cameras: 0, ...rates(0, 0), livTokens: 0, voiceMinutes: 0 },
  {
    id: "orion",
    name: "Liv",
    cameras: 0,
    ...rates(20, 229),
    livTokens: 10_000_000,
    voiceMinutes: 60,
  },
  {
    id: "cam2",
    name: "2 cameras",
    cameras: 2,
    ...rates(47, 549),
    livTokens: 15_000_000,
    voiceMinutes: 120,
  },
  {
    id: "cam4",
    name: "4 cameras",
    cameras: 4,
    ...rates(75, 879),
    livTokens: 25_000_000,
    voiceMinutes: 200,
  },
  {
    id: "cam6",
    name: "6 cameras",
    cameras: 6,
    ...rates(95, 1099),
    livTokens: 40_000_000,
    voiceMinutes: 300,
  },
  {
    id: "cam8",
    name: "8 cameras",
    cameras: 8,
    ...rates(111, 1299),
    livTokens: 50_000_000,
    voiceMinutes: 400,
  },
  {
    id: "cam12",
    name: "12 cameras",
    cameras: 12,
    ...rates(137, 1599),
    livTokens: 70_000_000,
    voiceMinutes: 560,
  },
  {
    id: "cam16",
    name: "16 cameras",
    cameras: 16,
    ...rates(155, 1799),
    livTokens: 90_000_000,
    voiceMinutes: 700,
  },
] as const;

export const hardware = [
  { id: "box", name: "Agrointel box", price: { eur: 920, nok: 10790 }, lookupKey: "pecorva_box" },
  {
    id: "camera",
    name: "Tested camera",
    price: { eur: 150, nok: 1749 },
    lookupKey: "pecorva_camera",
  },
] as const;

export type PlanId = (typeof plans)[number]["id"];
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";
export const trialDays = 30;
export const lookupKey = (plan: PaidPlanId, interval: BillingInterval) =>
  `pecorva_${plan}_${interval === "month" ? "monthly" : "yearly"}`;

export function isPaidPlan(id: unknown): id is PaidPlanId {
  return plans.some((plan) => plan.id !== "free" && plan.id === id);
}

export function planFor(id: string) {
  return plans.find((plan) => plan.id === id) ?? plans[0];
}
