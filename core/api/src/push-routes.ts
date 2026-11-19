import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { farmHeader, memberRole, resolveSession } from "./auth";
import { type CoreDb, pushDevices } from "./db";
import { afterResponse, type createPush } from "./push";

export function createPushRoutes(db: CoreDb, push: ReturnType<typeof createPush>, now: () => Date) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", async (c, next) => {
    const token = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
    const user = await resolveSession(db, token, now());
    if (!user)
      return c.json(
        { error: { code: token.startsWith("orb_s_") || !token ? "unauthorized" : "forbidden" } },
        token.startsWith("orb_s_") || !token ? 401 : 403,
      );
    c.set("userId", user.id);
    await next();
  });
  app.on(["POST", "DELETE"], "/devices", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      if (error instanceof SyntaxError) return c.json({ error: { code: "bad_request" } }, 400);
      throw error;
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("token" in body) ||
      typeof body.token !== "string" ||
      !body.token ||
      body.token.length > 4096
    )
      return c.json({ error: { code: "bad_request" } }, 400);
    const userId = c.get("userId");
    if (c.req.method === "DELETE") {
      await db
        .delete(pushDevices)
        .where(and(eq(pushDevices.token, body.token), eq(pushDevices.userId, userId)));
    } else {
      if (
        !("platform" in body) ||
        body.platform !== "android" ||
        ("locale" in body && typeof body.locale !== "string")
      )
        return c.json({ error: { code: "bad_request" } }, 400);
      const values = {
        token: body.token,
        userId,
        platform: "android" as const,
        locale: "locale" in body && typeof body.locale === "string" ? body.locale : null,
        updatedAt: now().toISOString(),
      };
      await db
        .insert(pushDevices)
        .values(values)
        .onConflictDoUpdate({ target: pushDevices.token, set: values });
    }
    return c.json({ ok: true });
  });
  app.post("/notify", async (c) => {
    const farmId = farmHeader(c.req.raw.headers);
    if (!farmId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(farmId))
      return c.json({ error: { code: "bad_request" } }, 400);
    const userId = c.get("userId");
    if (!(await memberRole(db, farmId, userId)))
      return c.json({ error: { code: "forbidden" } }, 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (error) {
      if (error instanceof SyntaxError) return c.json({ error: { code: "bad_request" } }, 400);
      throw error;
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("kind" in body) ||
      (body.kind !== "liv_done" && body.kind !== "liv_needs_you") ||
      !("sessionId" in body) ||
      typeof body.sessionId !== "string" ||
      !body.sessionId ||
      body.sessionId.length > 200 ||
      !("title" in body) ||
      typeof body.title !== "string" ||
      body.title.length > 300
    )
      return c.json({ error: { code: "bad_request" } }, 400);
    const notification: Parameters<typeof push.notify>[1] = {
      kind: body.kind,
      sessionId: body.sessionId,
      title: body.title,
      farmId,
    };
    afterResponse(() => push.notify(userId, notification));
    return c.body(null, 204);
  });
  return app;
}
