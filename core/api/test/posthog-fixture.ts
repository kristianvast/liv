import type { FetchLike } from "../src/shape";

/** Uses the same outbound HTTP seam as Stripe, Google and LLM route tests. */
export function posthogSink(upstream?: FetchLike) {
  const received = Promise.withResolvers<unknown>();
  const bodies: unknown[] = [];
  const doFetch: FetchLike = async (input, init) => {
    if (new URL(String(input)).hostname === "capture.test") {
      const body: unknown = JSON.parse(String(init?.body));
      bodies.push(body);
      received.resolve(body);
      return new Response(null, { status: 200 });
    }
    if (upstream) return upstream(input, init);
    throw new TypeError(`Unexpected external request ${input}`);
  };
  return {
    posthog: { key: "public-project-key", host: "https://capture.test" },
    fetch: doFetch,
    received: received.promise,
    bodies,
  };
}
