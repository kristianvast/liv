import { expect, test } from "bun:test";
import { setupCatalog } from "../src/stripe-setup";

// An EUR-only Liv price, a camera with the wrong NOK price, and a new catalog otherwise.
test("setup upgrades existing prices, transfers changed keys and leaves a reconciled catalog alone", async () => {
  const prices = new Map([
    [
      "pecorva_orion_monthly",
      {
        id: "old_liv",
        currency: "eur",
        unit_amount: 2000,
        tax_behavior: "exclusive",
        currency_options: {},
      },
    ],
    [
      "pecorva_camera",
      {
        id: "old_camera",
        currency: "eur",
        unit_amount: 15000,
        tax_behavior: "exclusive",
        currency_options: { nok: { unit_amount: 10, tax_behavior: "exclusive" } },
      },
    ],
  ]);
  const writes: string[] = [];
  const stripe = async (path: string, form?: URLSearchParams) => {
    const url = new URL(path, "https://stripe.test/");
    const key = url.searchParams.get("lookup_keys[]") ?? form?.get("lookup_key") ?? "";
    if (url.pathname.startsWith("/products")) return { data: [] };
    if (!form) {
      const p = prices.get(key);
      return {
        data: p
          ? [
              {
                ...p,
                currency_options:
                  url.searchParams.get("expand[]") === "data.currency_options"
                    ? p.currency_options
                    : null,
              },
            ]
          : [],
      };
    }
    writes.push(path);
    const nok = {
      unit_amount: Number(form.get("currency_options[nok][unit_amount]")),
      tax_behavior: form.get("currency_options[nok][tax_behavior]") ?? "",
    };
    if (path === "prices/old_liv") {
      const liv = prices.get("pecorva_orion_monthly");
      if (liv) prices.set("pecorva_orion_monthly", { ...liv, currency_options: { nok } });
    } else if (path === "prices") {
      if (prices.has(key) && form.get("transfer_lookup_key") !== "true")
        throw new TypeError("lookup key in use");
      prices.set(key, {
        id: `new_${key}`,
        currency: form.get("currency") ?? "",
        unit_amount: Number(form.get("unit_amount")),
        tax_behavior: form.get("tax_behavior") ?? "",
        currency_options: { nok },
      });
    }
    return {};
  };
  await setupCatalog(stripe);
  expect(prices.size).toBe(16);
  expect(prices.get("pecorva_orion_monthly")).toMatchObject({
    id: "old_liv",
    currency_options: { nok: { unit_amount: 22900 } },
  });
  expect(prices.get("pecorva_camera")).toMatchObject({
    id: "new_pecorva_camera",
    currency_options: { nok: { unit_amount: 174900 } },
  });
  expect(writes).toContain("prices/old_camera");
  expect(prices.get("pecorva_cam8_yearly")).toMatchObject({
    unit_amount: 111000,
    currency_options: { nok: { unit_amount: 1299000 } },
  });
  writes.length = 0;
  await setupCatalog(stripe);
  expect(writes).toEqual([]);
});
