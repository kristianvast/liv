import { resolveSession } from "./auth";
import type { CoreDb } from "./db";
import {
  type Currency,
  currencies,
  defaultCurrency,
  hardware,
  type PaidPlanId,
  planFor,
  trialDays,
} from "./plans";
import {
  BillingError,
  object,
  priceFor,
  type StripeClient,
  type StripeOptions,
  string,
  stripeClient,
} from "./stripe";

const SHIPPING_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "NO",
  "IS",
  "CH",
  "GB",
  "US",
  "CA",
  "AU",
  "NZ",
] as const;

/** The configured redirects and the website origins: the only places Stripe may send a buyer back to. */
function redirectOrigins(options: StripeOptions): Set<string> {
  const origins = new Set<string>();
  for (const allowed of [
    options.successUrl,
    options.cancelUrl,
    ...(options.redirectOrigins ?? []),
  ]) {
    if (allowed && URL.canParse(allowed)) origins.add(new URL(allowed).origin);
  }
  return origins;
}

export function redirectUrl(
  value: unknown,
  fallback: string | undefined,
  options: StripeOptions,
): string {
  const supplied = value !== undefined && value !== null;
  const text = string(supplied ? value : fallback, "redirect URL");
  let url: URL;
  try {
    url = new URL(text);
  } catch (error) {
    if (error instanceof TypeError)
      throw new BillingError(400, "bad_request", "Invalid redirect URL");
    throw error;
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new BillingError(400, "bad_request", "Redirect URL must use HTTPS");
  }
  // A link to Stripe that returns the buyer to a stranger's site is a phishing tool.
  if (supplied && !redirectOrigins(options).has(url.origin))
    throw new BillingError(400, "bad_request", "Redirect URL must point at the Agrointel website");
  return url.href;
}

/** Stripe Tax, VAT number collection and a billing address on every Checkout Session. */
export function addTaxFields(form: URLSearchParams, options: StripeOptions) {
  if (!options.automaticTax) return;
  form.set("automatic_tax[enabled]", "true");
  form.set("tax_id_collection[enabled]", "true");
  form.set("billing_address_collection", "required");
}

export function hardwareSelection(body: Record<string, unknown>) {
  const box = body.box === undefined ? 0 : body.box;
  const cameras = body.cameras === undefined ? 0 : body.cameras;
  if (
    typeof box !== "number" ||
    typeof cameras !== "number" ||
    !Number.isSafeInteger(box) ||
    !Number.isSafeInteger(cameras) ||
    box < 0 ||
    cameras < 0 ||
    box > 2 ||
    cameras > 16
  )
    throw new BillingError(
      400,
      "bad_request",
      "Choose whole hardware quantities within the order limits",
    );
  return { box, cameras } as const;
}

export function checkoutCurrency(value: unknown = defaultCurrency): Currency {
  const currency = currencies.find((candidate) => candidate === value);
  if (!currency) throw new BillingError(400, "bad_request", "Choose eur or nok");
  return currency;
}

/** Called under the account lock. Stripe still knows the history before a webhook arrives. */
export async function prepareTrialCheckout(stripe: StripeClient, customer: string) {
  const open = await stripe(
    `checkout/sessions?${new URLSearchParams({ customer, status: "open", limit: "100" })}`,
  );
  if (!Array.isArray(open.data) || open.has_more === true)
    throw new BillingError(502, "stripe_error", "Unable to check for open Checkout sessions");
  for (const item of open.data) {
    const session = object(item);
    if (object(session.metadata ?? {}).liv_trial === "true") {
      // If the buyer completed this session concurrently, expiry fails rather than offering
      // a second trial. A retry will see the completed subscription.
      await stripe(
        `checkout/sessions/${encodeURIComponent(string(session.id, "session id"))}/expire`,
        new URLSearchParams(),
      );
    }
  }
  const subscriptions = await stripe(
    `subscriptions?${new URLSearchParams({ customer, status: "all", limit: "1" })}`,
  );
  if (!Array.isArray(subscriptions.data))
    throw new BillingError(502, "stripe_error", "Unable to check previous subscriptions");
  return subscriptions.data.length === 0;
}

/**
 * The website quotes every plan per month, also when yearly billing is picked. A yearly
 * checkout says so next to the pay button: what is due today, that it covers a year, and
 * how to switch back to monthly.
 */
export function addYearlyNote(
  form: URLSearchParams,
  order: {
    readonly plan: PaidPlanId;
    readonly currency: Currency;
    readonly hardware: ReturnType<typeof hardwareSelection>;
    readonly trial: boolean;
  },
  options: StripeOptions,
) {
  const { currency, hardware: selection } = order;
  const { name, monthly, yearly } = planFor(order.plan);
  const money = new Intl.NumberFormat(currency === "nok" ? "nb-NO" : "en-IE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format;
  const hardwareTotal =
    selection.box * hardware[0].price[currency] + selection.cameras * hardware[1].price[currency];
  const taxNote = options.automaticTax ? " before VAT" : "";
  const due = money((order.trial ? 0 : yearly[currency]) + hardwareTotal) + taxNote;
  const covers =
    hardwareTotal > 0 ? "a year of your plan plus your hardware" : "a year of your plan";
  const dueToday = order.trial
    ? `Due today: ${due}${hardwareTotal > 0 ? " for your hardware" : ""}. Your plan is free for ${trialDays} days, then ${money(yearly[currency])}${taxNote} is due for the first year.`
    : `Due today: ${due}, for ${covers}.`;
  form.set(
    "custom_text[submit][message]",
    `${dueToday} The pricing page showed ${name} at ${money(yearly[currency] / 12)} a month; here it is billed yearly at ${money(yearly[currency])}. To pay ${money(
      monthly[currency],
    )} every month instead, go back to the previous page and pick Monthly.`,
  );
}

export async function addHardware(
  form: URLSearchParams,
  selection: ReturnType<typeof hardwareSelection>,
  stripe: StripeClient,
) {
  if (selection.box + selection.cameras === 0) return;
  let index = form.get("mode") === "subscription" ? 1 : 0;
  for (const [item, quantity] of [
    [hardware[0], selection.box],
    [hardware[1], selection.cameras],
  ] as const) {
    if (quantity === 0) continue;
    form.set(`line_items[${index}][price]`, await priceFor(stripe, item.lookupKey));
    form.set(`line_items[${index}][quantity]`, String(quantity));
    index++;
  }
  form.set("metadata[box]", String(selection.box));
  form.set("metadata[cameras]", String(selection.cameras));
  for (const [index, country] of SHIPPING_COUNTRIES.entries()) {
    form.set(`shipping_address_collection[allowed_countries][${index}]`, country);
  }
  if (form.get("mode") === "subscription") form.set("customer_update[shipping]", "auto");
}

export async function hardwareCheckout(db: CoreDb, request: Request, options: StripeOptions) {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  const buyer = bearer ? await resolveSession(db, bearer, options.now()) : null;
  if (!buyer) throw new BillingError(401, "unauthorized", "Sign in first");
  const body = object(await request.json());
  const selection = hardwareSelection(body);
  if (selection.box + selection.cameras === 0)
    throw new BillingError(400, "bad_request", "Choose a positive number of boxes or cameras");
  const form = new URLSearchParams({
    mode: "payment",
    currency: checkoutCurrency(body.currency),
    success_url: redirectUrl(body.successUrl, options.successUrl, options),
    cancel_url: redirectUrl(body.cancelUrl, options.cancelUrl, options),
    customer_creation: "always",
    "invoice_creation[enabled]": "true",
    "metadata[user_id]": buyer.id,
    customer_email: buyer.email,
  });
  addTaxFields(form, options);
  const stripe = stripeClient(options);
  await addHardware(form, selection, stripe);
  const session = await stripe("checkout/sessions", form);
  options.capture?.({
    event: "checkout_started",
    distinct_id: buyer.id,
    properties: { plan: null, interval: null, kind: "hardware", account: "personal" },
  });
  return Response.json({ url: string(session.url, "checkout URL") });
}
