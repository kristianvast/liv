import { expect, test } from "bun:test";
import { createPosthog } from "../src/posthog";
import { NOW } from "./billing-fixture";
import { multiUserFixture } from "./multi-user-fixture";
import { posthogSink } from "./posthog-fixture";
import { deferred, serveAgent, socketEvent } from "./voice-agent-fixture";

const { db, person, memberHeaders } = multiUserFixture();

test("a voice session reports its final seconds once under its user's identity", async () => {
  let clock = NOW.getTime();
  const upstreamClosed = deferred<void>();
  const upstream = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return;
      return new Response("upgrade failed", { status: 400 });
    },
    websocket: {
      message() {},
      close() {
        upstreamClosed.resolve();
      },
    },
  });
  const sink = posthogSink();
  const gateway = serveAgent(db, {
    now: () => new Date(clock),
    capture: createPosthog({ ...sink.posthog, fetch: sink.fetch }),
    fetch: async () => Response.json({ signed_url: `ws://127.0.0.1:${upstream.port}` }),
  });
  const client = new WebSocket(gateway.url.replace("http:", "ws:"), {
    headers: memberHeaders(false),
  });
  try {
    await socketEvent(client, "open");
    clock += 2500;
    client.close();
    await gateway.closed;
    await upstreamClosed.promise;
    expect(await sink.received).toMatchObject({
      batch: [
        {
          event: "voice_used",
          distinct_id: person.id,
          properties: { seconds: 3, model: "elevenlabs:agent_test" },
        },
      ],
    });
    expect(sink.bodies).toHaveLength(1);
  } finally {
    client.close();
    await gateway.server.stop(true);
    await upstream.stop(true);
  }
});
