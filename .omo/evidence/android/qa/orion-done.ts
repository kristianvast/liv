// Orion's own push: a chat started over the relay whose phone leaves before the run settles.
//   bun .omo/evidence/android/qa/orion-done.ts
import { connect, readState, relayHeaders, relayUrl } from "./lib";

const state = readState();
if (!state.owner?.session || !state.farmId) throw new Error("run setup.ts first");
const phone = await connect(relayUrl(), relayHeaders(state.owner.session, state.farmId), "relay");
const created = await phone.request("sessions.create", { title: "Barn walk question" });
const sessionId: string = created.session.id;
await phone.request("chat.prompt", { sessionId, text: "Tell me about my herd while I walk to the barn" });
phone.close();
console.log(JSON.stringify({ sessionId, phoneLeftAt: new Date().toISOString() }));
