import { expect, jest, test } from "bun:test";
import { object } from "../src/stripe";
import { billingFixture, NOW } from "./billing-fixture";
import { posthogSink } from "./posthog-fixture";

const { app } = billingFixture();

test("first Google sign-in emits account creation under the new user ID", async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({
    iss: "https://accounts.google.com",
    aud: "test-client",
    sub: "google-new-person",
    email: "google@example.test",
    email_verified: true,
    iat: NOW.getTime() / 1000,
    exp: NOW.getTime() / 1000 + 3600,
  })}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(unsigned),
  );
  const sink = posthogSink(async () =>
    Response.json({
      keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }],
    }),
  );
  const a = app({ ...sink, googleClientIds: ["test-client"] });
  const request = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      credential: `${unsigned}.${Buffer.from(signature).toString("base64url")}`,
      acceptTerms: true,
      deviceName: "Liv on Test-PC",
    }),
  };
  const response = await a.request("/v1/auth/google", request);
  expect(response.status).toBe(201);
  const user = object(object(await response.json()).user);
  expect(await sink.received).toMatchObject({
    batch: [
      {
        event: "account_created",
        distinct_id: user.id,
        properties: { source: "app", method: "google" },
      },
    ],
  });
  jest.useFakeTimers();
  try {
    expect((await a.request("/v1/auth/google", request)).status).toBe(200);
    jest.advanceTimersByTime(0);
    expect(sink.bodies).toHaveLength(1);
  } finally {
    jest.useRealTimers();
  }
});
