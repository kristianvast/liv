// usage: bun live-after-call.ts <orionPort> <token>
import { createOrionClient } from "/Users/kristianvastveit/projects/orbit/packages/protocol/src/client.ts";
const [port = "", token = ""] = process.argv.slice(2);
const client = createOrionClient(`ws://127.0.0.1:${port}/ws`, token, { reconnect: false });
await client.ready();
try {
  const billing = await client.request("billing.status", {});
  console.log("usage:", JSON.stringify(billing.usage));
  const { sessions } = await client.request("sessions.list");
  const top = sessions[0];
  console.log("conversations:", sessions.length, "| newest:", JSON.stringify({ title: top?.title, messageCount: top?.messageCount }));
  if (top) {
    const { items } = await client.request("sessions.open", { sessionId: top.id });
    for (const item of items) {
      const row = item as { kind: string; text?: string; name?: string; status?: string; voice?: boolean; args?: unknown };
      console.log(row.kind === "tool" ? `  tool ${row.name} ${row.status} ${JSON.stringify(row.args).slice(0, 80)}` : `  ${row.kind}${row.voice ? " (voice)" : ""}: ${(row.text ?? "").slice(0, 110)}`);
    }
  }
} finally { client.close(); }
