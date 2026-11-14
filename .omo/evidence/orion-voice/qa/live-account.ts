// usage: bun live-account.ts <orionPort> <token> <coreUrl> <coreLogFile>
import { createOrionClient } from "/Users/kristianvastveit/projects/orbit/packages/protocol/src/client.ts";
const [port = "", token = "", coreUrl = "", coreLog = ""] = process.argv.slice(2);
const client = createOrionClient(`ws://127.0.0.1:${port}/ws`, token, { reconnect: false });
await client.ready();
try {
  let status = await client.request("account.status", {});
  console.log("before:", status.state);
  if (status.state !== "signed_in") {
    status = await client.request("account.register", { email: "qa-voice@example.com", password: "qa-voice-Throwaway-1!", name: "QA Farmer", acceptTerms: true });
    console.log("registered:", status.state, JSON.stringify({ farm: status.farm?.name, role: status.farm?.role, verified: (status.user as { emailVerified?: boolean } | null)?.emailVerified }));
  }
  const log = await Bun.file(coreLog).text();
  const code = log.match(/orb_v_[A-Za-z0-9_-]+/g)?.at(-1);
  if (!code) throw new Error("no verification link in the Core log");
  const res = await fetch(`${coreUrl}/v1/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: code }) });
  console.log("verify-email:", res.status, JSON.stringify(await res.json()));
  await client.request("account.refresh", {});
  const billing = await client.request("billing.status", {});
  console.log("billing:", JSON.stringify({ plan: billing.plan, status: billing.status, trialEndsAt: (billing as { trialEndsAt?: string | null }).trialEndsAt, usage: billing.usage }));
} finally { client.close(); }
