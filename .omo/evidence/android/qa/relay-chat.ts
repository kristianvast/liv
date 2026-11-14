// Criterion 1: a phone-side client talks to Orion on the PC through Core's relay.
//   bun .omo/evidence/android/qa/relay-chat.ts   -> .omo/evidence/android/relay-chat.json
import { CORE, connect, EVIDENCE, ORION_TOKEN, ORION_URL, readState, relayHeaders, relayUrl } from "./lib";

const state = readState();
if (!state.owner?.session || !state.farmId) throw new Error("run setup.ts first");

const phone = await connect(relayUrl(), relayHeaders(state.owner.session, state.farmId), "relay");
const created = await phone.request("sessions.create", { title: "Phone relay QA" });
const sessionId: string = created.session?.id ?? created.sessionId ?? created.id;
if (!sessionId) throw new Error(`sessions.create gave no id: ${JSON.stringify(created)}`);

const text = "Who is in my herd?";
await phone.request("chat.prompt", { sessionId, text });
await phone.waitFor((e) => e.type === "agent.settled" && e.sessionId === sessionId, 90_000, "agent.settled");

const ends = phone.events.filter((e) => e.type === "message.end" && e.sessionId === sessionId);
const assistant = ends.map((e) => e.item).filter((item) => item?.kind === "assistant");
const errors = assistant.filter((item) => item.errorMessage).map((item) => item.errorMessage);
const reply = assistant.findLast((item) => typeof item.text === "string" && item.text.trim() !== "" && !item.errorMessage);
phone.close();

// Proof that the reply was produced by the Orion on the PC: its own local socket holds the same turn.
const local = await connect(ORION_URL, undefined, ORION_TOKEN);
const opened = await local.request("sessions.open", { sessionId });
local.close();
const localTranscript = JSON.stringify(opened);
const replyText: string = reply?.text ?? "";
const replyInTranscript =
  replyText !== "" && localTranscript.includes(JSON.stringify(replyText.slice(0, 40)).slice(1, -1));

const pass = replyText !== "" && errors.length === 0 && localTranscript.includes(text) && replyInTranscript;
const artifact = {
  criterion: 1,
  at: new Date().toISOString(),
  core: CORE,
  relay: relayUrl(),
  orion: ORION_URL,
  farmId: state.farmId,
  hello: phone.hello,
  sessionId,
  prompt: text,
  eventTypes: phone.events.map((e) => e.type),
  assistantMessageEnd: assistant,
  settled: true,
  localOrionTranscriptHoldsPrompt: localTranscript.includes(text),
  modelErrors: errors,
  reply: replyText,
  localOrionTranscriptHoldsReply: replyInTranscript,
  pass,
};
await Bun.write(`${EVIDENCE}relay-chat.json`, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`criterion 1 ${pass ? "PASS" : "FAIL"}: ${assistant.length} assistant message.end, ${errors.length} model errors, reply ${JSON.stringify(replyText.slice(0, 160))}, on the PC too: ${replyInTranscript}`);
process.exit(pass ? 0 : 1);
