import { beforeEach } from "bun:test";
import { pg } from "@orbit/schema";
import { sql } from "drizzle-orm";
import { createSession } from "../src/auth";
import { farmMembers, users } from "../src/db";
import type { PushOptions } from "../src/push";
import { billingFixture, FARM, NOW } from "./billing-fixture";
import { deferred } from "./voice-agent-fixture";

export function pushFixture() {
  const fixture = billingFixture();
  beforeEach(async () => {
    await fixture.db.execute(sql`truncate observations, animals`);
  });
  async function otherMember() {
    const [user] = await fixture.db
      .insert(users)
      .values({ email: "other@example.test" })
      .returning();
    if (!user) throw new TypeError("Missing user fixture");
    await fixture.db.insert(farmMembers).values({ userId: user.id, farmId: FARM, role: "worker" });
    const session = await createSession(fixture.db, user.id, null, NOW);
    return {
      userId: user.id,
      headers: { ...fixture.headers(), authorization: `Bearer ${session.token}` },
    };
  }
  const request = (
    app: ReturnType<typeof fixture.app>,
    path: string,
    body: unknown,
    headers: RequestInit["headers"] = fixture.headers(),
    method = "POST",
  ) => app.request(`/v1/push/${path}`, { method, headers, body: JSON.stringify(body) });
  function transport(expected = 1, response = Response.json({ name: "sent" })) {
    const responseBody = response.text();
    const done = deferred<void>();
    const messages: unknown[] = [];
    const requests: { url: string; auth: string | null }[] = [];
    const push: PushOptions = {
      projectId: "test-project",
      accessToken: async () => "fake-google-token",
      fetch: async (url, init) => {
        requests.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
        messages.push(JSON.parse(String(init?.body)));
        if (messages.length === expected) done.resolve();
        return new Response(await responseBody, { status: response.status });
      },
    };
    return { push, messages, requests, done: done.promise };
  }
  async function animal() {
    const id = crypto.randomUUID();
    await fixture.db.insert(pg.animals).values({
      id,
      farmId: FARM,
      name: "Dagros",
      earTagNumber: "1001",
      species: "cattle",
      sex: "female",
      status: "active",
      originDevice: "pc",
      hlc: "000000000000001:000000:pc",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    return id;
  }
  async function change(app: ReturnType<typeof fixture.app>, row: Record<string, unknown>) {
    const response = await app.request("/v1/changes", {
      method: "POST",
      headers: fixture.headers(),
      body: JSON.stringify({
        changes: [
          {
            seq: 1,
            table: "observations",
            op: row.deleted_at ? "delete" : "insert",
            rowId: row.id,
            hlc: row.hlc,
            row,
          },
        ],
      }),
    });
    return { status: response.status, body: await response.json() };
  }
  function observation(extra: Record<string, unknown> = {}) {
    return {
      id: crypto.randomUUID(),
      farm_id: FARM,
      animal_id: null,
      kind: "calving_alert",
      ts: NOW.toISOString(),
      source: "connector",
      origin_device: "pc",
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      deleted_at: null,
      hlc: `${String(NOW.getTime()).padStart(15, "0")}:000001:pc`,
      ...extra,
    };
  }
  return { ...fixture, otherMember, request, transport, animal, change, observation };
}
