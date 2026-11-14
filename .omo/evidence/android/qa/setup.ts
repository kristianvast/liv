// Prepares the local QA farm: two verified accounts in Core, the owner signed in on the local
// Orion, the seeded farm put in the cloud, phone access switched on.
//   CORE_LOG=<core stdout log> bun .omo/evidence/android/qa/setup.ts
import { readFileSync } from "node:fs";
import {
  type Account,
  CORE,
  connect,
  core,
  ORION_TOKEN,
  ORION_URL,
  readState,
  waitRelay,
  writeState,
} from "./lib";

const CORE_LOG = process.env.CORE_LOG;
if (!CORE_LOG) throw new Error("CORE_LOG (the Core process log holding the mail lines) is required");

const password = () => `Qa-${crypto.randomUUID()}`;

function verifyToken(email: string): string {
  const blocks = readFileSync(CORE_LOG as string, "utf8").split("[mail:");
  for (const block of blocks.reverse()) {
    if (!block.startsWith("verify_email]") || !block.includes(`to=${email} `)) continue;
    const token = /[?&]verify=([^\s&]+)/.exec(block)?.[1];
    if (token) return decodeURIComponent(token);
  }
  throw new Error(`no verification mail for ${email} in ${CORE_LOG}`);
}

async function ensureAccount(account: Account, name: string): Promise<Account> {
  let res = await core("POST", "/v1/auth/register", {
    body: { email: account.email, password: account.password, acceptTerms: true, name, deviceName: "qa-phone" },
  });
  if (res.status === 409) {
    res = await core("POST", "/v1/auth/login", {
      body: { email: account.email, password: account.password, deviceName: "qa-phone" },
    });
  }
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`sign-up/sign-in for ${account.email} answered ${res.status} ${res.text}`);
  }
  if (!res.json.user.emailVerified) {
    const verified = await core("POST", "/v1/auth/verify-email", { body: { token: verifyToken(account.email) } });
    if (verified.status !== 200) throw new Error(`verify-email answered ${verified.status} ${verified.text}`);
  }
  return { ...account, session: res.json.session.token, userId: res.json.user.id };
}

const state = readState();
state.owner = await ensureAccount(
  state.owner ?? { email: "phone-owner@orbit-qa.test", password: password() },
  "Phone QA owner",
);
state.outsider = await ensureAccount(
  state.outsider ?? { email: "phone-outsider@orbit-qa.test", password: password() },
  "Phone QA outsider",
);
writeState(state);

const orion = await connect(ORION_URL, undefined, ORION_TOKEN);
let status = await orion.request("account.status");
if (status.state !== "signed_in" || status.user?.email !== state.owner.email) {
  status = await orion.request("account.login", { email: state.owner.email, password: state.owner.password });
}
if (!status.farm) status = await orion.request("farms.create", {});
if (!status.farm) throw new Error(`no cloud farm after farms.create: ${JSON.stringify(status)}`);
state.farmId = status.farm.id;
writeState(state);

// Signing in makes the cloud model the chosen model; this local Core has no model provider behind
// it, so the QA farm chooses Orion's mock model explicitly.
const settings = await orion.request("settings.update", {
  phoneAccess: true,
  provider: "orion-mock",
  model: "mock-1",
});
if (settings.phoneAccess !== true) throw new Error("phone access did not switch on");
if (settings.provider !== "orion-mock") throw new Error(`model is ${settings.provider}/${settings.model}`);
await waitRelay(state.owner.session as string, state.farmId as string, true);
orion.close();

console.log(
  JSON.stringify(
    { core: CORE, orion: ORION_URL, owner: state.owner.email, outsider: state.outsider.email, farmId: state.farmId, farmName: status.farm.name, role: status.farm.role, phoneAccess: true, relayOnline: true },
    null,
    2,
  ),
);
