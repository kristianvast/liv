import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { UUID } from "./account-input";
import { hashToken } from "./auth";
import type { CoreDb } from "./db";
import type { Capture } from "./posthog";
import { withinRate } from "./rate-limit";
import { clientIp } from "./voice-demo";

const Launch = Type.Object(
  {
    install_id: Type.String({ pattern: UUID.source }),
    os: Type.Enum(["windows", "macos", "linux"]),
    app_version: Type.String({
      pattern: "^\\d+\\.\\d+\\.\\d+(?:[-+][A-Za-z0-9.-]+)?$",
      maxLength: 64,
    }),
  },
  { additionalProperties: false },
);

export function createAppLaunchRoutes(db: CoreDb, capture: Capture, now: () => Date) {
  const routes = new Hono();
  // This anonymous endpoint carries no account credentials; native webviews have distinct origins.
  routes.use("/v1/app/first-launch", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"] }));
  routes.post("/v1/app/first-launch", bodyLimit({ maxSize: 1024 }), async (c) => {
    let input: unknown;
    try {
      input = await c.req.json();
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return c.json({ error: { code: "bad_request" } }, 400);
    }
    if (!Value.Check(Launch, input)) return c.json({ error: { code: "bad_request" } }, 400);
    const identity = `app-launch:ip:${await hashToken(clientIp(c.req.header("x-forwarded-for")))}`;
    const allowed = await db.transaction((tx) => withinRate(tx, identity, 20, 86_400_000, now()));
    if (!allowed) return c.json({ error: { code: "rate_limited" } }, 429);
    capture({
      event: "app_first_launch",
      distinct_id: input.install_id,
      properties: { os: input.os, app_version: input.app_version },
    });
    return c.body(null, 202);
  });
  return routes;
}
