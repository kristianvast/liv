// usage: bun live-voice-start.ts <orionPort> <token>
import { createOrionClient } from "/Users/kristianvastveit/projects/orbit/packages/protocol/src/client.ts";
const [port = "", token = ""] = process.argv.slice(2);
const client = createOrionClient(`ws://127.0.0.1:${port}/ws`, token, { reconnect: false });
await client.ready();
try {
  const { session } = await client.request("sessions.create", {});
  try {
    const call = await client.request("voice.start", { sessionId: session.id });
    console.log("voice.start OK:", JSON.stringify({ path: call.path.replace(/\/voice\/[^/]+\//, "/voice/<token>/"), variables: call.variables }));
    await client.request("voice.stop", { voiceId: call.voiceId });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.log("voice.start REFUSED:", err.code, "-", err.message);
  }
  await client.request("sessions.delete", { sessionId: session.id });
} finally { client.close(); }
