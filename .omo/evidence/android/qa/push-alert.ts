// Criterion 5, PC side: records one alert observation through Orion's own protocol, the way the
// desktop app does, and prints its id.   bun .omo/evidence/android/qa/push-alert.ts [kind]
import { connect, ORION_TOKEN, ORION_URL } from "./lib";

const kind = process.argv[2] ?? "calving_alert";
const orion = await connect(ORION_URL, undefined, ORION_TOKEN);
const { rows } = await orion.request("db.query", { query: "animals.list", params: {} });
const animal = rows.find((row: { name: string | null }) => row.name === "Ruby") ?? rows[0];
const before = await orion.request("db.query", { query: "farm.summary", params: {} });
const result = await orion.request("db.mutate", {
  mutation: "observations.add",
  params: {
    animalId: animal.id,
    kind,
    ts: new Date().toISOString(),
    valueJson: { severity: "urgent", message: "Phone push QA" },
  },
});
const after = await orion.request("db.query", { query: "farm.summary", params: {} });
orion.close();
console.log(
  JSON.stringify({
    kind,
    animal: { id: animal.id, name: animal.name },
    mutationResult: result,
    alertsBefore: before.recentAlerts.length,
    alertsAfter: after.recentAlerts.length,
    at: new Date().toISOString(),
  }),
);
