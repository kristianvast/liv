import { expect, jest, mock, spyOn, test } from "bun:test";
import { createPosthog, type ProductEvent } from "../src/posthog";

const event: ProductEvent = {
  event: "account_created",
  distinct_id: "core-user-id",
  properties: { source: "app", method: "password" },
};

test("capture without a key schedules no outbound request", () => {
  const outbound = mock(async () => new Response());
  jest.useFakeTimers();
  try {
    createPosthog({ fetch: outbound })(event);
    jest.advanceTimersByTime(10_000);
    expect(outbound).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

test("capture sends a timestamped batch to the configured host without blocking its caller", async () => {
  const received = Promise.withResolvers<{
    url: string;
    body: unknown;
    signal: AbortSignal | null | undefined;
  }>();
  const release = Promise.withResolvers<Response>();
  const capture = createPosthog({
    key: "public-project-key",
    host: "http://capture.test/",
    now: () => new Date("2026-11-17T12:00:00Z"),
    fetch: async (input, init) => {
      received.resolve({
        url: String(input),
        body: JSON.parse(String(init?.body)),
        signal: init?.signal,
      });
      return release.promise;
    },
  });

  expect(capture(event)).toBeUndefined();
  try {
    const request = await received.promise;
    expect(request.url).toBe("http://capture.test/batch/");
    expect(request.body).toEqual({
      api_key: "public-project-key",
      batch: [
        {
          event: "account_created",
          distinct_id: "core-user-id",
          properties: { source: "app", method: "password", $geoip_disable: true },
          timestamp: "2026-11-17T12:00:00.000Z",
        },
      ],
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  } finally {
    release.resolve(new Response());
  }
});

test.each(["throw", "reject", "http"] as const)(
  "capture contains %s failures and logs only the first failure",
  async (failure) => {
    const logged = Promise.withResolvers<void>();
    const twice = Promise.withResolvers<void>();
    let requests = 0;
    const warning = spyOn(console, "warn").mockImplementation(() => logged.resolve());
    const capture = createPosthog({
      key: "public-project-key",
      fetch: () => {
        if (++requests === 2) twice.resolve();
        switch (failure) {
          case "throw":
            throw new TypeError("Network unavailable");
          case "reject":
            return Promise.reject(new TypeError("Network unavailable"));
          case "http":
            return Promise.resolve(new Response(null, { status: 503 }));
        }
      },
    });
    try {
      expect(() => capture(event)).not.toThrow();
      await logged.promise;
      capture(event);
      await twice.promise;
      expect(warning).toHaveBeenCalledTimes(1);
    } finally {
      warning.mockRestore();
    }
  },
);
