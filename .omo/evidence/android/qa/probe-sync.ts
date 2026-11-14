
import { connect, core, ORION_URL, ORION_TOKEN, readState } from "./lib";
const st = readState();
const o = await connect(ORION_URL, undefined, ORION_TOKEN);
const sync = o.events.filter((e) => e.type === "sync.status").at(-1);
console.log("sync.status event:", JSON.stringify(sync));
const summary = await o.request("db.query", { query: "farm.summary", params: {} });
console.log("recentAlerts:", summary.recentAlerts.length, JSON.stringify(summary.recentAlerts[0]).slice(0, 300));
const acct = await o.request("account.status");
console.log("account:", acct.state, acct.farm?.id);
o.close();
