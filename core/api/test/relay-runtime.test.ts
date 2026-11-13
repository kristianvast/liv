import { expect, test } from "bun:test";
import { serveCore } from "../src/runtime";
import { billingFixture } from "./billing-fixture";
import { socketEvent } from "./voice-agent-fixture";

const { db, headers } = billingFixture();

test("production runtime serves relay alongside both voice upgrade routes", async () => {
  const port = process.env.PORT;
  process.env.PORT = "0";
  const server = serveCore(db, 0);
  if (port === undefined) delete process.env.PORT;
  else process.env.PORT = port;
  const base = `http://127.0.0.1:${server.port}`;
  const host = new WebSocket(`${base.replace("http:", "ws:")}/v1/relay/host`, {
    headers: headers(),
  });
  try {
    await socketEvent(host, "open");
    expect(await (await fetch(`${base}/v1/relay/status`, { headers: headers() })).json()).toEqual({
      online: true,
    });
    for (const path of ["/v1/voice/live", "/v1/voice/agent"]) {
      const response = await fetch(`${base}${path}`, { headers: { upgrade: "websocket" } });
      expect(response.status).toBe(401);
    }
    const closed = socketEvent(host, "close");
    host.send("a".repeat(16 * 1024 * 1024 + 1));
    expect((await closed).code).toBe(1009);
  } finally {
    host.close();
    await server.stop(true);
  }
});
