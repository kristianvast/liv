
import { connect, ORION_URL, ORION_TOKEN } from "./lib";
const o = await connect(ORION_URL, undefined, ORION_TOKEN);
const list = await o.request("sessions.list");
const latest = [...list.sessions].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
console.log("sessions:", list.sessions.length, "latest:", JSON.stringify(latest));
const opened = await o.request("sessions.open", { sessionId: latest.id });
console.log(JSON.stringify(opened.items, null, 1).slice(0, 2500));
o.close();
