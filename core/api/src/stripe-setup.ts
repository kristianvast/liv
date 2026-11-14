import { currency, hardware, lookupKey, plans } from "./plans";
import { object, string, stripeClient } from "./stripe";

const stripe = stripeClient({
  secretKey: process.env.STRIPE_SECRET_KEY,
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
});
for (const item of [...plans, ...hardware]) {
  if (item.id === "free") continue;
  const productId = `pecorva_${item.id}`;
  const products = await stripe(`products?${new URLSearchParams({ limit: "100" })}`);
  const exists =
    Array.isArray(products.data) &&
    products.data.some((entry: unknown) => object(entry).id === productId);
  if (!exists)
    await stripe(
      "products",
      new URLSearchParams({ id: productId, name: item.name }),
      `product-${productId}`,
    );
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
    if (current && current.unit_amount === amount) {
      string(current.id, "price id");
      console.log(price.key);
      continue;
    }
    // Stripe prices cannot be edited: a changed amount gets a new price that takes over the
    // lookup key, and the old one is archived (existing subscriptions keep their old price).
    const form = new URLSearchParams({
      product: productId,
      currency,
      unit_amount: String(amount),
      lookup_key: price.key,
      transfer_lookup_key: "true",
    });
    if (price.interval) form.set("recurring[interval]", price.interval);
    await stripe("prices", form, `price-${price.key}-${amount}`);
    if (current)
      await stripe(
        `prices/${string(current.id, "price id")}`,
        new URLSearchParams({ active: "false" }),
      );
    console.log(`${price.key} ${current ? "replaced" : "created"} at ${price.amount}`);
  }
}
