import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";

test("0007 maps legacy subscriptions and replaces the plan CHECK", async () => {
  const client = new PGlite();
  try {
    await client.exec(
      await Bun.file(new URL("../migrations/0003_billing.sql", import.meta.url)).text(),
    );
    await client.exec(`INSERT INTO farm_subscriptions (farm_id, plan, status) VALUES
      ('00000000-0000-4000-8000-000000000001','pen','active'),
      ('00000000-0000-4000-8000-000000000002','barn','active'),
      ('00000000-0000-4000-8000-000000000003','free','free')`);
    await client.exec(
      await Bun.file(new URL("../migrations/0007_plan_ladder.sql", import.meta.url)).text(),
    );
    expect(
      (await client.query("SELECT plan FROM farm_subscriptions ORDER BY farm_id")).rows,
    ).toEqual([{ plan: "cam2" }, { plan: "cam6" }, { plan: "free" }]);
    await client.exec(`INSERT INTO farm_subscriptions (farm_id, plan, status) VALUES
      ('00000000-0000-4000-8000-000000000004','orion','active'),
      ('00000000-0000-4000-8000-000000000005','cam4','active')`);
    for (const plan of ["pen", "barn", "cam3"]) {
      await expect(
        client.query("INSERT INTO farm_subscriptions (farm_id, plan, status) VALUES ($1,$2,$3)", [
          "00000000-0000-4000-8000-000000000006",
          plan,
          "active",
        ]),
      ).rejects.toMatchObject({ constraint: "farm_subscriptions_plan_check" });
    }
  } finally {
    await client.close();
  }
});

test("0013 widens the plan CHECK to the 8, 12 and 16 camera plans", async () => {
  const client = new PGlite();
  try {
    for (const file of [
      "0003_billing.sql",
      "0007_plan_ladder.sql",
      "0013_larger_camera_plans.sql",
    ]) {
      await client.exec(await Bun.file(new URL(`../migrations/${file}`, import.meta.url)).text());
    }
    const plans = ["free", "orion", "cam2", "cam4", "cam6", "cam8", "cam12", "cam16"];
    for (const [index, plan] of plans.entries()) {
      await client.query(
        "INSERT INTO farm_subscriptions (farm_id, plan, status) VALUES ($1,$2,$3)",
        [`00000000-0000-4000-8000-00000000001${index}`, plan, "active"],
      );
    }
    expect((await client.query("SELECT count(*)::int AS n FROM farm_subscriptions")).rows).toEqual([
      { n: plans.length },
    ]);
    for (const plan of ["cam10", "cam20", "pen"]) {
      await expect(
        client.query("INSERT INTO farm_subscriptions (farm_id, plan, status) VALUES ($1,$2,$3)", [
          "00000000-0000-4000-8000-000000000099",
          plan,
          "active",
        ]),
      ).rejects.toMatchObject({ constraint: "farm_subscriptions_plan_check" });
    }
  } finally {
    await client.close();
  }
});
