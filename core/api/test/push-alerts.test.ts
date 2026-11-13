import { expect, test } from "bun:test";
import { pg } from "@orbit/schema";
import { eq } from "drizzle-orm";
import { FARM, NOW } from "./billing-fixture";
import { pushFixture } from "./push-fixture";

const f = pushFixture();
test.each([
  ["calving_alert", "push_calving_title"],
  ["health_event", "push_health_title"],
  ["heat_alert", "push_heat_title"],
])("new %s alerts reach all farm members with localized animal body", async (kind, title) => {
  const transport = f.transport(2);
  const app = f.app({ push: transport.push });
  const other = await f.otherMember();
  await f.request(app, "devices", { token: "mine", platform: "android" });
  await f.request(app, "devices", { token: "theirs", platform: "android" }, other.headers);
  const animalId = await f.animal();
  const row = f.observation({ kind, animal_id: animalId });
  expect(await f.change(app, row)).toEqual({
    status: 200,
    body: { results: [{ seq: 1, status: "applied" }] },
  });
  await transport.done;
  expect(transport.messages).toEqual(
    ["mine", "theirs"].map((token) => ({
      message: {
        token,
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "alerts",
            title_loc_key: title,
            body_loc_key: "push_alert_body_named",
            body_loc_args: ["Dagros"],
          },
        },
        data: { kind, farmId: FARM, observationId: row.id, animalId },
      },
    })),
  );
});

test.each(["tag", "unnamed"])("alerts use %s body when an animal name is absent", async (body) => {
  const transport = f.transport();
  const app = f.app({ push: transport.push });
  await f.request(app, "devices", { token: "phone", platform: "android" });
  const animalId = body === "tag" ? await f.animal() : null;
  if (animalId)
    await f.db.update(pg.animals).set({ name: null }).where(eq(pg.animals.id, animalId));
  const row = f.observation({ animal_id: animalId });
  await f.change(app, row);
  await transport.done;
  expect(transport.messages).toEqual([
    {
      message: {
        token: "phone",
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "alerts",
            title_loc_key: "push_calving_title",
            body_loc_key: body === "tag" ? "push_alert_body_named" : "push_alert_body_unnamed",
            ...(body === "tag" ? { body_loc_args: ["1001"] } : {}),
          },
        },
        data: {
          kind: "calving_alert",
          farmId: FARM,
          observationId: row.id,
          animalId: animalId ?? "",
        },
      },
    },
  ]);
});

test("old deleted nonalert repeated and updated observations send nothing", async () => {
  const transport = f.transport(2);
  const app = f.app({ push: transport.push });
  await f.request(app, "devices", { token: "phone", platform: "android" });
  const rows = [
    f.observation({ ts: new Date(NOW.getTime() - 86_400_001).toISOString() }),
    f.observation({ deleted_at: NOW.toISOString() }),
    f.observation({ kind: "temperature" }),
  ];
  for (const row of rows)
    expect((await f.change(app, row)).body).toEqual({ results: [{ seq: 1, status: "applied" }] });
  const sentinel = f.observation();
  await f.change(app, sentinel);
  await f.change(app, sentinel);
  await f.change(app, { ...sentinel, hlc: `${String(NOW.getTime()).padStart(15, "0")}:000002:pc` });
  const next = f.observation();
  await f.change(app, next);
  await transport.done;
  expect(transport.messages).toEqual(
    [sentinel, next].map((row) => ({
      message: {
        token: "phone",
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "alerts",
            title_loc_key: "push_calving_title",
            body_loc_key: "push_alert_body_unnamed",
          },
        },
        data: { kind: "calving_alert", farmId: FARM, observationId: row.id, animalId: "" },
      },
    })),
  );
});
