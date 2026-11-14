// Local stand-in for ElectricSQL: every shape is empty and up to date. Without it Core answers
// 502 on /v1/shape, each sync cycle on the PC fails, and its pushes to Core back off.
//   PORT=8798 bun .omo/evidence/android/qa/fake-electric.ts
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 8798),
  async fetch(request) {
    if (new URL(request.url).searchParams.get("live") === "true") await Bun.sleep(5000);
    return Response.json([{ headers: { control: "up-to-date" } }], {
      headers: { "electric-handle": "h1", "electric-offset": "0_0", "electric-up-to-date": "" },
    });
  },
});
console.log(`fake electric on :${server.port}`);
