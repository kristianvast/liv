import { currency, hardware, lookupKey, plans } from "./plans";
import { object, string, stripeClient } from "./stripe";

const stripe = stripeClient({
  secretKey: process.env.STRIPE_SECRET_KEY,
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
});
// Stripe Tax needs to know what is sold to pick each country's rate: plans are software used by
// a business, the box and cameras are goods that are shipped.
const SOFTWARE_TAX_CODE = "txcd_10103001";
const GOODS_TAX_CODE = "txcd_99999999";

for (const item of [...plans, ...hardware]) {
  if (item.id === "free") continue;
  const productId = `pecorva_${item.id}`;
  const taxCode = "monthly" in item ? SOFTWARE_TAX_CODE : GOODS_TAX_CODE;
  const products = await stripe(`products?${new URLSearchParams({ limit: "100" })}`);
  const existing = Array.isArray(products.data)
    ? products.data.map((entry: unknown) => object(entry)).find((entry) => entry.id === productId)
    : undefined;
  if (!existing)
    await stripe(
      "products",
      new URLSearchParams({ id: productId, name: item.name, tax_code: taxCode }),
      `product-${productId}`,
    );
  else if (existing.tax_code !== taxCode)
    await stripe(`products/${productId}`, new URLSearchParams({ tax_code: taxCode }));
  const prices =
    "monthly" in item
      ? [
          { key: lookupKey(item.id, "month"), amount: item.monthly, interval: "month" },
          { key: lookupKey(item.id, "year"), amount: item.yearly, interval: "year" },
        ]
      : [{ key: item.lookupKey, amount: item.price, interval: null }];
  for (const price of prices) {
    const found = await stripe(
      `prices?${new URLSearchParams({ "lookup_keys[]": price.key, active: "true" })}`,
    );
    const current =
      Array.isArray(found.data) && found.data.length > 0 ? object(found.data[0]) : null;
    const amount = price.amount * 100;
    // Every price is the amount before tax: Stripe adds the buyer's country's tax on top. A
    // price that has no tax behaviour yet can be given one once; after that it is fixed.
    if (current && current.unit_amount === amount && current.tax_behavior === "unspecified") {
      await stripe(
        `prices/${string(current.id, "price id")}`,
        new URLSearchParams({ tax_behavior: "exclusive" }),
      );
      console.log(`${price.key} now excludes tax`);
      continue;
    }
    if (current && current.unit_amount === amount && current.tax_behavior === "exclusive") {
      console.log(price.key);
      continue;
    }
    // Stripe prices cannot be edited: a changed amount, or a price that includes tax, gets a new
    // price that takes over the lookup key, and the old one is archived (existing subscriptions
    // keep their old price).
    const form = new URLSearchParams({
      product: productId,
      currency,
      unit_amount: String(amount),
      tax_behavior: "exclusive",
      lookup_key: price.key,
      transfer_lookup_key: "true",
    });
    if (price.interval) form.set("recurring[interval]", price.interval);
    await stripe("prices", form, `price-${price.key}-${amount}-exclusive`);
    if (current)
      await stripe(
        `prices/${string(current.id, "price id")}`,
        new URLSearchParams({ active: "false" }),
      );
    console.log(`${price.key} ${current ? "replaced" : "created"} at ${price.amount}`);
  }
}
