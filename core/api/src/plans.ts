export const plans = [
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

export const hardware = [
  { id: "box", name: "Agrointel box", price: 920, lookupKey: "pecorva_box" },
  { id: "camera", name: "Tested camera", price: 150, lookupKey: "pecorva_camera" },
] as const;

export type PlanId = (typeof plans)[number]["id"];
export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";
export const currency = "eur";
export const trialDays = 30;
export const lookupKey = (plan: PaidPlanId, interval: BillingInterval) =>
  `pecorva_${plan}_${interval === "month" ? "monthly" : "yearly"}`;

export function isPaidPlan(id: unknown): id is PaidPlanId {
  return plans.some((plan) => plan.id !== "free" && plan.id === id);
}

export function planFor(id: string) {
  return plans.find((plan) => plan.id === id) ?? plans[0];
}
