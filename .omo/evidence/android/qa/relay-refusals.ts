// Criterion 2: what the relay refuses.
//   bun .omo/evidence/android/qa/relay-refusals.ts   -> .omo/evidence/android/relay-refusals.txt
import {
  CORE,
  connect,
  EVIDENCE,
  ORION_TOKEN,
  ORION_URL,
  RequestError,
  readState,
  relayHeaders,
  relayUrl,
  waitRelay,
} from "./lib";

const state = readState();
const owner = state.owner?.session;
const outsider = state.outsider?.session;
const farm = state.farmId;
if (!owner || !outsider || !farm) throw new Error("run setup.ts first");

const lines: string[] = [`Relay refusals, ${new Date().toISOString()}, Core ${CORE}`, ""];
const verdicts: boolean[] = [];

async function upgrade(label: string, headers: string[], shown: string[], expect: RegExp) {
  const args = [
    "curl", "-i", "-sS", "--max-time", "5",
    "-H", "Connection: Upgrade", "-H", "Upgrade: websocket",
    "-H", "Sec-WebSocket-Version: 13", "-H", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
  ];
  const url = `${CORE}/v1/relay/client`;
  const proc = Bun.spawn([...args, ...headers.flatMap((h) => ["-H", h]), url], {
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = `${await new Response(proc.stdout).text()}${await new Response(proc.stderr).text()}`;
  await proc.exited;
  const ok = expect.test(out);
  verdicts.push(ok);
  lines.push(`## ${label}`, `$ ${[...args, ...shown.flatMap((h) => ["-H", `'${h}'`]), url].join(" ")}`, out.trim(), `=> ${ok ? "PASS" : "FAIL"} (expected ${expect})`, "");
}

await upgrade("no session", [`x-orbit-farm: ${farm}`], [`x-orbit-farm: ${farm}`], /^HTTP\/1\.1 401/);
await upgrade(
  "another account's session on this farm",
  [`Authorization: Bearer ${outsider}`, `x-orbit-farm: ${farm}`],
  ["Authorization: Bearer <outsider session>", `x-orbit-farm: ${farm}`],
  /^HTTP\/1\.1 403/,
);

const local = await connect(ORION_URL, undefined, ORION_TOKEN);
await local.request("settings.update", { phoneAccess: false });
await waitRelay(owner, farm, false);
await upgrade(
  "phone access switched off on the PC",
  [`Authorization: Bearer ${owner}`, `x-orbit-farm: ${farm}`],
  ["Authorization: Bearer <owner session>", `x-orbit-farm: ${farm}`],
  /^HTTP\/1\.1 409[\s\S]*pc_offline/,
);
await local.request("settings.update", { phoneAccess: true });
await waitRelay(owner, farm, true);

const before = await local.request("settings.get");
const phone = await connect(relayUrl(), relayHeaders(owner, farm), "relay");
async function refused(label: string, type: string, params: Record<string, unknown>) {
  const answer = await phone.request(type, params).then(
    () => "accepted",
    (error) => (error instanceof RequestError ? error.code : `error: ${String(error)}`),
  );
  const ok = answer === "forbidden";
  verdicts.push(ok);
  lines.push(`## ${label}`, `relayed request ${JSON.stringify({ type, ...params })}`, `answer: ${answer}`, `=> ${ok ? "PASS" : "FAIL"} (expected forbidden)`, "");
}
await refused("relayed auth.providers", "auth.providers", {});
await refused("relayed settings.update toolAccess", "settings.update", {
  toolAccess: { shell: true, browser: true, computer: true },
});
await refused("relayed settings.update phoneAccess", "settings.update", { phoneAccess: false });

const allowed = await phone.request("settings.get").then(
  () => true,
  () => false,
);
verdicts.push(allowed);
lines.push("## control: relayed settings.get still works", `=> ${allowed ? "PASS" : "FAIL"}`, "");
phone.close();

const after = await local.request("settings.get");
local.close();
const unchanged = JSON.stringify(before.toolAccess) === JSON.stringify(after.toolAccess) && after.phoneAccess === true;
verdicts.push(unchanged);
lines.push(
  "## the PC's settings are unchanged by the refused requests",
  `toolAccess before ${JSON.stringify(before.toolAccess)} after ${JSON.stringify(after.toolAccess)}, phoneAccess ${after.phoneAccess}`,
  `=> ${unchanged ? "PASS" : "FAIL"}`,
  "",
);

const pass = verdicts.every(Boolean);
lines.push(`OVERALL ${pass ? "PASS" : "FAIL"} (${verdicts.filter(Boolean).length}/${verdicts.length})`);
await Bun.write(`${EVIDENCE}relay-refusals.txt`, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
process.exit(pass ? 0 : 1);
