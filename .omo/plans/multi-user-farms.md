# Multi-user farms: membership admin, shared/own usage, per-user token reporting, farm picker, per-user chats

User request (2026-11-12): "build and optimize support for multiple users on one farm. joining a farm, the user can
use their usage if the farm owner have allowed this. build propper admin control and invite and removal. and to see
which user uses how much tokens. also user being able to switch from using their own usage and farmer usage. orion
chats stays uniqe to user."
User decisions (ask_user_question): own usage = the member's OWN Orion plan; permission = per-member toggle +
optional monthly token cap. User comment: "creating an account dosnt need to create a farm. orbit can be used
without a farm. but a user can create a farm and invite others. there should also be a farm picker so one user can
access several farms."

## Concepts

- **Billing account**: whose allowance pays for a model/voice request. Either a farm (`kind: "farm"`, id = farm id)
  or a person (`kind: "personal"`, id = user id). Personal plans reuse `billing_customers` / `farm_subscriptions`
  rows keyed by the user id in the `farm_id` column (uuid spaces are disjoint; documented in db.ts). Stripe metadata
  `farm_id` then carries the user id, so the webhook/subscription code needs no change; checkout also sets
  `metadata[account]=personal`.
- **Personal entitlement**: same plan ladder; the free month runs from the user's own `created_at` and needs a
  confirmed email (same rule as farms, where it runs from the first owner's `created_at`).
- **Member usage permission** (on `farm_members`): `use_farm_plan boolean` (owners always true; existing rows
  migrate to true so nobody loses access; new invites default false unless role owner), `monthly_token_limit bigint
  null` (null = no cap; calendar month UTC), `usage_source text null` ("farm" | "own" | null = automatic).
- **Effective source** for a request from user U on farm F:
  - no farm (signed in, no farm header) -> personal.
  - `usage_source = "own"` -> personal.
  - `usage_source = "farm"` -> farm if allowed, otherwise personal.
  - null (auto) -> farm if allowed AND the farm entitlement has a token allowance > 0 (paid or free month), else
    personal.
  - Farm-billed requests also check the member cap: U's farm-billed tokens this calendar month >= cap -> 429
    `member_limit`.
- **Usage rows**: `llm_usage` and `voice_usage` gain `user_id uuid null` and `account_id uuid not null` (backfilled
  = farm_id). Allowance sums use `account_id`; per-member reporting groups by `(farm_id, user_id, account_id)`.

## Core HTTP contract (core/api)

- `GET /v1/me` -> `{ user, farms: [{ farmId, role, name, plan, useFarmPlan, monthlyTokenLimit, usageSource }],
  personal: { plan } }`.
- `GET /v1/farms/:farmId/members` -> `{ members: [{ userId, email, name, role, createdAt, useFarmPlan,
  monthlyTokenLimit, usageSource, usage?: { farmTokens, ownTokens, voiceSeconds } }] }`. `usage` (this calendar
  month, requests made on this farm) is included for every member when the caller is owner/manager, else only on the
  caller's own row.
- `PATCH /v1/farms/:farmId/members/:userId` body any of `{ role, useFarmPlan, monthlyTokenLimit (int >= 0 | null) }`;
  same role rules as today (canManageMember / assignableRoles / last owner). Owners cannot be restricted
  (useFarmPlan false or a limit on an owner -> 409 `owner_usage`); promoting to owner sets useFarmPlan true and clears
  the limit. Response `{ member: <member view> }`.
- `PATCH /v1/farms/:farmId/me` body `{ usageSource: "farm" | "own" | null }` (any member) -> `{ member }`.
- `POST /v1/farms/:farmId/invites` body adds optional `useFarmPlan` (default false; true for owner invites) and
  `monthlyTokenLimit`; invite view adds both; accept copies them into the member row.
- Billing (`/v1/billing/status|checkout|portal`): user session may omit `x-orbit-farm` -> personal account.
  `status` returns the EFFECTIVE account plus: `account: "farm" | "personal"`, `usageSource` (stored choice or null),
  `farmPlanAllowed` (bool; false without farm), `member: { tokensUsed, tokenLimit } | null` (farm-billed tokens this
  month for this member, null without farm), `personal: { plan, tokensUsed, tokenAllowance, trialEndsAt }` (always),
  `farm: { plan, tokensUsed, tokenAllowance, trialEndsAt } | null`. `checkout`/`portal` take optional body
  `account: "farm" | "personal"` (default: "farm" when a farm header is present and the caller manages it, else
  personal). Checkout WITHOUT a farm no longer creates a farm; it buys the personal plan.
- `/v1/llm/*`: user session may omit the farm header (personal). Resolution as above; 402 `plan_required` when the
  effective account has no allowance; 429 `budget_exceeded` (account) or `member_limit` (cap). Rows record user_id +
  account_id.
- `/v1/voice/agent` (voice.ts): same resolution for voice seconds.
- `DELETE /v1/me`: refuses while a personal plan is running (same 409 `subscription_active`).
- Migration `core/api/migrations/0009_multi_user.sql` (+ drizzle definitions in db.ts).

## Protocol contract (packages/protocol) - done by the orchestrator first

See packages/protocol/src/account.ts and billing.ts after the change:
- `AccountStatus.farms?: AccountFarm[]` (all cloud farms of the account, for the picker) and
  `AccountStatus.localFarm?: { id, name } | null` (this PC's own farm when it is NOT in the cloud).
- `FarmMember` + `useFarmPlan`, `monthlyTokenLimit`, `usageSource`, `usage?`.
- `FarmInvite` + `useFarmPlan`, `monthlyTokenLimit`.
- `members.update` params `{ userId, role?, useFarmPlan?, monthlyTokenLimit? }`.
- `invites.create` params + `useFarmPlan?`, `monthlyTokenLimit?`.
- `farms.create { name }` -> AccountStatus (puts this PC's farm in the cloud, owned by the caller).
- `farms.open { farmId }` -> `{ restarting: boolean }` (opens another of the account's farms, or `"local"` for this
  PC's own farm; Orion restarts onto that farm's data folder).
- `billing.status` result + `account`, `usageSource`, `farmPlanAllowed`, `member`, `personal`, `farm` (all optional
  for older Cores). `billing.setSource { source: "farm" | "own" | null }` -> BillingStatus.
  `billing.checkout` / `billing.portal` params + optional `account`.
- Event `sessions.reset {}`: the chat list changed wholesale (another person signed in); the app reloads it.

## Orion (packages/orion) - orchestrator

- No farm is created or claimed in the cloud on sign-in. link(): chosen farm (farms.json) -> that membership; local
  farm already a cloud member -> that; fresh install (no local farm) with account farms -> first; else farm null.
  `farms.create` does the old claim/adopt.
- Model gateway is registered for any signed-in session; the farm header only when a farm is linked.
- BillingService works without a farm (personal); `billing.setSource` -> PATCH /v1/farms/:id/me.
- Farm data folders: this PC's farm stays in the data root; another cloud farm opened on this PC lives in
  `<data>/farms/<farmId>/` (orbit.sqlite, workspace, modules, sessions). `farms.json` `{ active, root }`. Opening a
  farm restarts Orion (desktop shell restarts on clean exit; dev main.ts restarts in-process).
- Chats per person: sessions live in `<farmDir>/sessions` for the first person seen after the upgrade (legacy owner,
  recorded in `sessions/owner.json`) and in `<farmDir>/sessions/people/<userId | local>/` for everyone else.
  Signing in/out as someone else switches the hub's chat list live and emits `sessions.reset`.

## App (apps/orbit) - UI lane

- Settings > Farm/Account: farm picker (account farms + this PC's own farm), "Put this farm in the cloud" (farms.create),
  Members card: role select, "May use farm plan" switch, monthly cap, this month's tokens (farm / own) per member,
  remove; invites with role + farm plan switch + cap, revoke; leave farm for non-owners.
- Plan/usage card: switch "Farm plan" / "My own plan" (billing.setSource), both allowances shown; farm switch disabled
  with a hint when not allowed. Symbols over text, compact (user preference). en + nb strings.
- Chat list reloads on `sessions.reset`.

## Delegation topology

- Protocol contract: orchestrator (shared by all lanes, must land first).
- Core lane (core/api/**): background `deep-low` child - independent HTTP + PG work with its own tests.
- App lane (apps/orbit/**): background `visual-engineering` child - against the protocol contract with the app's
  mocked Orion tests.
- Orion lane (packages/orion/**): orchestrator - cross-cutting (data dirs, restart, hub), and its integration tests
  run against real Core so it is sequenced after the Core lane lands.

## Success criteria (HEAVY: schema migration + billing/permissions + auth)

1. Happy path, HTTP (Core live): owner invites member with useFarmPlan=false; member accepts; member LLM call is
   billed to their personal account (llm_usage.account_id = member id); owner PATCHes useFarmPlan=true; member's
   next call bills the farm; members list shows per-member farm/own tokens. Evidence: curl transcript.
2. Edge: member cap reached -> 429 member_limit; owner restriction -> 409; signed in without farm -> LLM works on
   personal free month, checkout creates no farm. Evidence: curl + bun test.
3. Regression: core/api `bun test`, packages/orion `bun test`, apps/orbit tests, `bun run typecheck`, `bun run lint`.
4. Orion: sign-in without farm keeps farm null; farms.create puts it in the cloud; farms.open restarts onto the other
   farm's folder; chats differ per signed-in user. Evidence: orion integration test + protocol transcript.
5. Browser: Settings shows members with usage + toggles, source switch, farm picker (desktop + mobile widths).
