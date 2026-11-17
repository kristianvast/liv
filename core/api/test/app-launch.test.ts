import { expect, test } from "bun:test";
import { billingFixture } from "./billing-fixture";
import { posthogSink } from "./posthog-fixture";

const { app } = billingFixture();
const launch = {
  install_id: "00000000-0000-4000-8000-000000000012",
  os: "windows",
  app_version: "0.1.10",
};
const request = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.17" },
  body: JSON.stringify(body),
});

test("anonymous app launch forwards only the install identity OS and version", async () => {
  const sink = posthogSink();
  const response = await app(sink).request("/v1/app/first-launch", request(launch));
  expect(response.status).toBe(202);
  expect(await sink.received).toMatchObject({
    batch: [
      {
        event: "app_first_launch",
        distinct_id: launch.install_id,
        properties: {
          os: "windows",
          app_version: "0.1.10",
          $geoip_disable: true,
          $process_person_profile: false,
        },
      },
    ],
  });
});

test.each([
  { ...launch, install_id: "invalid" },
  { ...launch, os: "PC name" },
  { ...launch, app_version: "invalid" },
  { ...launch, email: "not-allowed@example.test" },
])("invalid launch reports are refused", async (body) => {
  const response = await app().request("/v1/app/first-launch", request(body));
  expect(response.status).toBe(400);
});

test("anonymous launches share a persistent per-address daily rate limit", async () => {
  // A distinct address keeps this test independent of earlier launches in the fixture database.
  const init = request(launch);
  init.headers["x-forwarded-for"] = "192.0.2.18";
  for (let i = 0; i < 20; i++) {
    expect((await app().request("/v1/app/first-launch", init)).status).toBe(202);
  }
  expect((await app().request("/v1/app/first-launch", init)).status).toBe(429);
});

test("native webviews can preflight anonymous launch reports", async () => {
  const response = await app().request("/v1/app/first-launch", {
    method: "OPTIONS",
    headers: {
      origin: "tauri://localhost",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});
