// QA driver: prints every frame of one voice turn on Orion's voice socket, in arrival order.
// usage: bun frames.ts <port> <token> "<question>"
import { createOrionClient } from "/Users/kristianvastveit/projects/orbit/packages/protocol/src/client.ts";

const [port = "", token = "", question = ""] = process.argv.slice(2);
const client = createOrionClient(`ws://127.0.0.1:${port}/ws`, token, { reconnect: false });
await client.ready();
const { session } = await client.request("sessions.create", {});
const call = await client.request("voice.start", { sessionId: session.id });
const done = Promise.withResolvers<void>();
const timer = setTimeout(() => done.reject(new Error("timed out")), 15000);
const t0 = performance.now();
const line = (dir: string, frame: unknown) =>
  console.log(`${String(Math.round(performance.now() - t0)).padStart(5)}ms ${dir} ${JSON.stringify(frame)}`);
const socket = new WebSocket(`ws://127.0.0.1:${port}${call.path}`);
const send = (frame: unknown) => {
  line("->", frame);
  socket.send(JSON.stringify(frame));
};
let asked = false;
let toolAnswered = false;
socket.onopen = () => send({ type: "conversation_initiation_client_data", dynamic_variables: call.variables });
socket.onerror = () => done.reject(new Error("voice socket failed"));
socket.onmessage = (event) => {
  void (async () => {
    const frame = JSON.parse(String(event.data)) as {
      type: string;
      client_tool_call?: { tool_name: "db_query"; tool_call_id: string; parameters: unknown };
    };
    line("<-", frame);
    if (frame.type === "agent_response" && !asked) {
      asked = true;
      send({ type: "user_message", text: question });
    } else if (frame.client_tool_call) {
      const tool = frame.client_tool_call;
      const answer = await client.request("voice.tool", {
        voiceId: call.voiceId,
        toolCallId: tool.tool_call_id,
        name: tool.tool_name,
        args: tool.parameters,
      });
      toolAnswered = true;
      send({
        type: "client_tool_result",
        tool_call_id: tool.tool_call_id,
        result: answer.result,
        is_error: answer.isError,
      });
    } else if (frame.type === "agent_response" && toolAnswered) done.resolve();
  })().catch(done.reject);
};
await done.promise;
clearTimeout(timer);
socket.close();
await client.request("voice.stop", { voiceId: call.voiceId });
client.close();
