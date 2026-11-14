// QA driver: talks to a running mock Orion the way the app does (protocol socket + voice socket).
// usage: bun ws-voice.ts <port> <token> talk|reopen <state-file>
import { createOrionClient } from "/Users/kristianvastveit/projects/orbit/packages/protocol/src/client.ts";

const [port = "", token = "", phase = "", stateFile = ""] = process.argv.slice(2);
const client = createOrionClient(`ws://127.0.0.1:${port}/ws`, token, { reconnect: false });
await client.ready();

const brief = (items: readonly { kind: string }[]) =>
  items.map((item) => {
    const row = item as { kind: string; text?: string; name?: string; status?: string; voice?: boolean };
    return row.kind === "tool"
      ? `tool ${row.name} ${row.status}`
      : `${row.kind}${row.voice ? " (voice)" : ""}: ${(row.text ?? "").slice(0, 90)}`;
  });

async function converse(sessionId: string, question: string, until: (answer: string) => boolean) {
  const call = await client.request("voice.start", { sessionId });
  console.log("voice.start ->", JSON.stringify({ path: call.path, variables: call.variables }));
  const done = Promise.withResolvers<void>();
  const timer = setTimeout(() => done.reject(new Error("timed out waiting for the answer")), 15000);
  const socket = new WebSocket(`ws://127.0.0.1:${port}${call.path}`);
  socket.onerror = () => done.reject(new Error("voice socket failed"));
  socket.onmessage = (event) => {
    void (async () => {
      const frame = JSON.parse(String(event.data)) as {
        type: string;
        agent_response_event?: { agent_response: string };
        client_tool_call?: { tool_name: string; tool_call_id: string; parameters: unknown };
      };
      if (frame.agent_response_event) {
        const text = frame.agent_response_event.agent_response;
        console.log("agent:", text);
        await client.request("voice.turn", { voiceId: call.voiceId, role: "assistant", text });
        if (text.startsWith("Hello")) {
          await client.request("voice.turn", { voiceId: call.voiceId, role: "user", text: question });
          socket.send(JSON.stringify({ type: "user_message", text: question }));
        } else if (until(text)) done.resolve();
      }
      if (frame.client_tool_call) {
        const tool = frame.client_tool_call;
        console.log("tool call:", tool.tool_name, JSON.stringify(tool.parameters));
        const answer = await client.request("voice.tool", {
          voiceId: call.voiceId,
          toolCallId: tool.tool_call_id,
          name: tool.tool_name as "db_query",
          args: tool.parameters,
        });
        console.log("tool answer:", answer.isError ? "ERROR" : "ok", answer.result.slice(0, 70));
        socket.send(
          JSON.stringify({
            type: "client_tool_result",
            tool_call_id: tool.tool_call_id,
            result: answer.result,
            is_error: answer.isError,
          }),
        );
      }
    })().catch(done.reject);
  };
  socket.onopen = () =>
    socket.send(
      JSON.stringify({ type: "conversation_initiation_client_data", dynamic_variables: call.variables }),
    );
  try {
    await done.promise;
  } finally {
    clearTimeout(timer);
    socket.close();
    await client.request("voice.stop", { voiceId: call.voiceId });
  }
}

try {
  if (phase === "talk") {
    const { session } = await client.request("sessions.create", {});
    await Bun.write(stateFile, session.id);
    console.log("session", session.id);
    await converse(session.id, "Who is in my herd?", (text) => text.startsWith("There are "));
    const settled = new Promise<void>((resolve) => {
      const off = client.on("agent.settled", (event) => {
        if (event.sessionId === session.id) {
          off();
          resolve();
        }
      });
    });
    await client.request("chat.prompt", { sessionId: session.id, text: "hello after the call" });
    await settled;
    const opened = await client.request("sessions.open", { sessionId: session.id });
    console.log("items after talk + chat:", JSON.stringify(brief(opened.items), null, 1));
    const listed = (await client.request("sessions.list")).sessions.find((s) => s.id === session.id);
    console.log("listed:", JSON.stringify({ title: listed?.title, messageCount: listed?.messageCount }));
  } else if (phase === "reopen") {
    const sessionId = (await Bun.file(stateFile).text()).trim();
    const opened = await client.request("sessions.open", { sessionId });
    console.log("items after restart:", JSON.stringify(brief(opened.items), null, 1));
    const call = await client.request("voice.start", { sessionId });
    console.log("recap after restart:", JSON.stringify(call.variables.conversation_recap));
    await client.request("voice.stop", { voiceId: call.voiceId });
  } else throw new Error(`unknown phase ${phase}`);
  console.log(`PHASE ${phase} OK`);
} finally {
  client.close();
}
