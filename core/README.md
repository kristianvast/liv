# Core

Core is Liv's optional cloud side. Liv works fully offline without it; when a farm connects
to Core, its data is backed up and shared across that farm's Liv installs, and Liv can use
the metered LLM gateway instead of the farmer's own API key.

```
Liv install (@liv/sync)                       Core
  outbox ── POST /v1/changes ──▶ @core/api ──▶ Postgres 17 (wal_level=logical)
  SQLite ◀── GET /v1/shape ───── @core/api ◀── Electric ◀── logical replication
  Liv  ─── POST /v1/llm/* ───▶ @core/api ──▶ LLM provider (metered per farm)
```

- **Postgres** holds the synced tables from `@liv/schema/pg` and Core-only tables
  (`api_tokens`, `farm_budgets`, `llm_usage`, `__core_migrations`).
- **Electric** (electricsql/electric, Apache-2.0) streams _shapes_ (one table plus a `where`
  filter) out of Postgres over HTTP. It is read-only and never exposed publicly.
- **@core/api** (Bun + Hono, `core/api`) is the only public service. It authenticates each farm,
  proxies shapes with the farm filter forced on, applies writes with last-writer-wins by HLC, and
  meters LLM usage.

## Endpoints

Farm routes accept a user session with `x-liv-farm` (membership required), or a legacy farm
token. Billing management, hardware checkout and voice require user sessions. Registration,
login, the price-gated plan catalog and signed Stripe webhooks are public.

| Route                                                                   | Purpose                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`, `GET /healthz`                                           | Liveness plus a `select 1` database check. No auth.                                                                                                                                           |
| `GET /v1/shape?table=<synced table>&offset=<o>[&handle=&live=&cursor=]` | Proxies to Electric with `where=farm_id = $1`, `params[1]=<token farm>`, `replica=full` and the Electric secret. Electric's headers (`electric-handle`, `electric-offset`, ...) pass through. |
| `POST /v1/changes`                                                      | Body `{ changes: [{ seq, op, table, rowId, hlc, row }] }`, at most 1000 per request. Returns `{ results: [{ seq, status, error? }] }`.                                                        |
| `POST /v1/llm/<provider path>`                                          | Forwards to `LLM_UPSTREAM_URL/<provider path>` using Core's key, after checking the farm's monthly budget.                                                                                    |
| `GET /v1/voice/live`                                                    | Session-authenticated, metered Gemini Live WebSocket for existing desktop clients.                                                                                                            |
| `GET /v1/voice/agent`                                                   | Session-authenticated, metered ElevenLabs Agents WebSocket; requires farm membership.                                                                                                         |

`POST /v1/changes` returns one status per change:

- `applied`: the row was written.
- `stale`: Core already has an equal or newer HLC. The client still marks the row as acked.
- `rejected`: the row failed validation (wrong farm, bad enum or type, delete without
  `deleted_at`, wearable flag that contradicts the device kind, or bad HLC). This is terminal.
- `conflict`: a concurrent binding race. The client retries.

Device bindings follow the domain rule that an animal wears a collar, a bolus or an ear tag
sensor, never two at once, and that a device is bound to only one animal at a time. When a pushed
active binding conflicts with an existing one, the binding with the newer HLC stays active and
Core ends the older one, stamping it with a fresh `cloud` HLC so the change syncs back to every
install.

## Run locally

For API development without Docker, use `bun run --filter '@core/api' dev`. It listens on
port 8787 (override `PORT`) and migrates PGlite persisted in `core/api/.dev-data/`, which is
gitignored. Export configuration first, or use `bun --env-file=core/.env core/api/src/dev.ts`.
Electric is optional for this runner; shape requests still need a real Electric instance.
For local accounts, run `MAIL_PROVIDER=log bun run --filter '@core/api' dev` from the repository
root. No database or mail credentials are needed. Verification messages appear in that terminal
as `[mail:verify_email]`, including `/account/?verify=<code>`. Open the link on the local website,
or POST `{"token":"<code>"}` to `http://localhost:8787/v1/auth/verify-email`.

## Accounts and email

### Product funnel analytics

Set `POSTHOG_KEY` to the public PostHog project ingestion key; `POSTHOG_HOST` defaults to
`https://eu.i.posthog.com`. Empty keys disable capture. Core sends best-effort JSON batches
with a two-second timeout, never awaits them on the request path, and logs its first delivery
failure per capture instance. There is no durable queue or retry; an instance stopped before
delivery can lose an event.

Events use `users.id` as `distinct_id`, matching the website's signed-in identity:
`account_created`, `checkout_started`, `checkout_completed`, `liv_request`, and `voice_used`.
No email, name, IP or conversation content is sent, and GeoIP enrichment is disabled.
Account source is `app` only when the request's trimmed `deviceName` begins `Liv on `
followed by a non-space character (Liv's existing hostname label); other labels, `Website`
and absent labels are `web`. This is attribution, not a security claim.

Checkout completion comes from existing `checkout.session.completed` with `payment_status=paid`
or `checkout.session.async_payment_succeeded`, after the webhook transaction commits.
Replayed Stripe event IDs emit nothing. Hardware-only checkouts have null plan and interval.
Free/no-payment checkouts are not counted as paid. Existing sessions without user metadata
and legacy farm API tokens without a user identity are not attributed to invented users.
Liv usage follows each `llm_usage` insert; voice reports final metered seconds on socket close,
not each periodic cumulative update.

`POST /v1/app/first-launch` accepts `{install_id, os, app_version}` anonymously and forwards
only these fields, at most 20 requests per hashed network address per day. Native webview
origins are allowed on this endpoint. See [desktop privacy](../apps/liv/PRIVACY.md).

Provisioning passes `POSTHOG_KEY` and `POSTHOG_HOST` as plain environment variables. Build
the new image with `core/deploy/build.sh` (it prints the image tag), then reconverge using the
usual production configuration:
`ENV=production IMAGE=<full-image-reference> POSTHOG_KEY=<public-key> POSTHOG_HOST=https://eu.i.posthog.com core/deploy/provision.sh`.
Also supply the required `PUBLIC_SITE_URL`, `CORE_CORS_ORIGINS`, `BILLING_SUCCESS_URL` and
`BILLING_CANCEL_URL` values for that environment. Provisioning without `IMAGE` preserves the
running image, so it does not install new code by itself.

Sign-up (`POST /v1/auth/register`) requires `acceptTerms: true` and records the terms version
(`TERMS_VERSION`) and the optional `dataConsent` choice. Core emails a verify link to
`PUBLIC_SITE_URL/account/?verify=<code>`; plan checkout and invite acceptance need a confirmed
address. Email links are single-use, stored as SHA-256 hashes, and expire (verify 48 h, reset 1 h).
Passwords must be 8 to 256 characters for registration, reset and password changes.

`POST /v1/auth/google` accepts `{credential, acceptTerms?, dataConsent?, deviceName?}`, where
`credential` is the Google Identity Services ID token. Core verifies its RS256 signature,
issuer, configured client audience and timestamps (60 seconds of clock skew), and requires
a verified email. Existing Google subjects sign in first; otherwise a matching lowercase email
links the account. New accounts require `acceptTerms: true`, record the consent choice, and have
no password or verification email. Password reset can add a password later. Returns
`{user, session, created}` with 201 for a new account and 200 otherwise, using the same user and
session fields as password login. Errors include 503 `google_disabled`, 401 `invalid_google_token`,
400 `google_email_unverified`, and 400 `terms_required`.

| Route                                                     | Purpose                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/auth/verify-email` `{token}`                    | Confirms the address (410 `link_invalid` when used or expired).                                                                                                          |
| `POST /v1/auth/resend-verification`                       | New verify link, at most one a minute.                                                                                                                                   |
| `POST /v1/auth/password-reset` `{email}`                  | Always 202, so it never reveals accounts; at most 3 links an hour.                                                                                                       |
| `POST /v1/auth/password-reset/confirm` `{token,password}` | Sets the password and signs out every session.                                                                                                                           |
| `POST /v1/me/password` `{currentPassword,newPassword}`    | Changes the password and signs out other sessions.                                                                                                                       |
| `GET /v1/me/sessions`, `DELETE /v1/me/sessions/:id`       | Lists and revokes signed-in devices.                                                                                                                                     |
| `GET /v1/me/export`                                       | JSON export of the account (profile, sessions, memberships, invites, orders).                                                                                            |
| `DELETE /v1/me` `{password}`                              | Deletes the account; cloud copies of farms it owns alone are wiped. A running plan must be cancelled and shared farms need another owner first. Invoices stay in Stripe. |
| `POST /v1/farms` `{id,name,adopt}`                        | A Liv install takes over an empty cloud farm the caller owns (members, plan, usage), e.g. one bought on the website.                                                     |

Failed sign-ins are counted per email in Postgres (`login_failures`), so the throttle holds across
instances. `MAIL_PROVIDER` is `resend`, `postmark` or `log` (prints messages, for development);
`src/server.ts` refuses to start without it. Emails: verify, password reset, password changed,
farm invite, plan active (Liv download and sign-in steps), hardware order receipt, and an
order notice to `ORDERS_EMAIL`.

## Feedback and shared builds

`POST /v1/feedback` accepts an optional user session and
`{kind:"issue"|"idea"|"other",message,contactEmail?,appVersion?,os?,locale?,diagnostics?}`.
Messages are 1 to 5000 characters; diagnostics are at most 20000. It returns `201 {id}`.
Each user, or client IP for anonymous requests, can send 20 messages per rolling 24 hours
(429 `rate_limited` thereafter). The client IP follows the Cloud Run convention: the last
`X-Forwarded-For` hop. Without that header, anonymous callers share the `unknown` bucket.
`feedback_rate_events` stores hashed anonymous identities and timestamps; an advisory transaction
lock makes the check and insert atomic across instances. Expired events for an identity are pruned
when it next submits. No raw IP is retained.

`POST /v1/submissions` requires a user session and accepts
`{kind:"page"|"connector"|"skill",name,title,description,appVersion?,files:[{path,content}]}`.
Names match `^[a-z0-9][a-z0-9-]{0,47}$`; titles are 1 to 120 characters and descriptions
1 to 2000. Include 1 to 60 UTF-8 text files, at most 512 KiB of content combined
(oversize returns 413). Paths are at most 200 characters, relative, without `..`, and each
segment matches `^[A-Za-z0-9_][A-Za-z0-9._-]*$`. Returns `201 {id,status:"pending"}`.
For either POST, `x-liv-farm` is recorded only when the signed-in user is a member.
`GET /v1/submissions` requires a session and returns the caller's own builds, newest first:
`{submissions:[{id,kind,name,title,status,reviewNote,createdAt,reviewedAt}]}`.

Set `CORE_FEEDBACK_EMAIL` to receive `feedback_received` and `submission_received` emails
through the configured mailer. Submission notices contain paths, never file bodies.
Mail failures are logged after the database write and do not fail either request.

Set the secret `CORE_ADMIN_TOKEN` to enable the owner inbox at `/admin` and these bearer-token
routes (all return 404 while disabled; wrong tokens return 401):

| Route                               | Body / response                               |
| ----------------------------------- | --------------------------------------------- |
| `GET /v1/admin/feedback?status=`    | `{feedback:[...]}` with full feedback rows    |
| `PATCH /v1/admin/feedback/:id`      | `{status:"new"                                | "read"     | "done"}`; returns updated row              |
| `GET /v1/admin/submissions?status=` | `{submissions:[...]}` with metadata, no files |
| `GET /v1/admin/submissions/:id`     | Full submission row including `files`         |
| `PATCH /v1/admin/submissions/:id`   | `{status:"pending"                            | "approved" | "rejected",reviewNote?}`; updated metadata |

Response fields use camelCase and ISO-8601 timestamps. Reviewing sets `reviewedAt`; returning to
pending clears it. Omitting `reviewNote` preserves it; an empty string clears it. The standalone
admin page keeps the token in `sessionStorage` until forgotten or the tab closes. Farmer text
is displayed as text, including file content; builds are never executed or published.

For Cloud Run provisioning, pass `SECRET_CORE_ADMIN_TOKEN=<strong token>` and optionally
`CORE_FEEDBACK_EMAIL=<address>`. The admin secret is mounted only when a real value exists;
the provisioning placeholder never enables the admin routes.

## Billing and Gemini

`GET /v1/billing/plans` returns `{currency:"eur",locked:false,trialDays:30,plans,hardware}` publicly:

| Plan                 | Cameras | EUR/month | EUR/year | Liv tokens/month | Voice minutes/month |
| -------------------- | ------- | --------- | -------- | ---------------- | ------------------- |
| Free (`free`)        | 0       | 0         | 0        | 0                | 0                   |
| Liv (`orion`)        | 0       | 20        | 200      | 2,000,000        | 30                  |
| 2 cameras (`cam2`)   | 2       | 47        | 470      | 3,000,000        | 60                  |
| 4 cameras (`cam4`)   | 4       | 75        | 750      | 5,000,000        | 100                 |
| 6 cameras (`cam6`)   | 6       | 95        | 950      | 8,000,000        | 150                 |
| 8 cameras (`cam8`)   | 8       | 111       | 1110     | 10,000,000       | 200                 |
| 12 cameras (`cam12`) | 12      | 137       | 1370     | 14,000,000       | 280                 |
| 16 cameras (`cam16`) | 16      | 155       | 1550     | 18,000,000       | 350                 |

The Agrointel box is EUR 920 and a Tested camera is EUR 150 once. API prices are euros;
Stripe amounts are cents. Paid allowances reset at the UTC calendar month start.
Each farm gets one free Liv pool (10 million tokens and 60 voice minutes) for 30 days from
the earliest account creation date among its owners. During this month its plan remains `free`
and usage counts from that date, across calendar month boundaries. The month is granted only once
that owner's email address is confirmed; until then the gateway answers 402 `plan_required` with
a confirm-your-email message. Farms without an owner have no free month. A paid active or
trialing subscription supersedes it.

Set `STRIPE_SECRET_KEY` and run `bun run --filter '@core/api' stripe:setup` once per Stripe
account. It idempotently creates products and EUR lookup prices. Configure Stripe to send
`checkout.session.completed`, `customer.subscription.created|updated|deleted`, and
`checkout.session.async_payment_succeeded|failed`, and `invoice.payment_failed` to
`POST /v1/billing/webhook`, then set `STRIPE_WEBHOOK_SECRET`.
Signatures expire after five minutes; event claims and subscription effects commit together.

Session routes take `Authorization: Bearer <session>` and `x-liv-farm`:

- `POST /v1/billing/checkout`: `{plan:"orion"|"cam2"|"cam4"|"cam6"|"cam8"|"cam12"|"cam16",interval:"month"|"year",box?,cameras?,successUrl?,cancelUrl?}`.
  Hardware quantities are whole numbers (`box` 0–2, `cameras` 0–16). Nonzero quantities add
  one-time hardware to the same subscription Checkout Session and collect shipping.
- `POST /v1/billing/portal`: `{returnUrl?}`. Checkout and portal require owner or manager.
- `GET /v1/billing/status`: subscription state plus token and voice usage for any member.
  `trialEndsAt` is an ISO timestamp during the free month, otherwise null.
- `POST /v1/billing/hardware-checkout`: `{box:0,cameras:1,successUrl?,cancelUrl?}` with shipping
  collection. Requires a user session, with no farm header. Buyer email comes from the session.
  Paid hardware orders and receipts are recorded once for either session mode.

Redirect defaults are `BILLING_SUCCESS_URL` and `BILLING_CANCEL_URL`. Browser access uses
`CORE_CORS_ORIGINS`, a comma-separated list (dev default `http://localhost:3000`).

With `LLM_UPSTREAM_AUTH=google` and `GCP_PROJECT`, Core derives the global Vertex
OpenAI endpoint, strips Liv's leading `/v1`, and maps `liv-default` to
`LLM_DEFAULT_MODEL` (default `google/gemini-3.8-flash`). The `liv-small` alias, used for short background jobs such as naming a conversation, maps to `LLM_SMALL_MODEL` (default `google/gemini-3.5-flash-lite`, falling back to the default model when unset). Google access tokens are cached
until 60 seconds before expiration. Auth uses GCP metadata on Cloud Run, then a
`GOOGLE_APPLICATION_CREDENTIALS` service account JWT, otherwise development-only
`gcloud auth application-default print-access-token`.

Active or trialing paid subscriptions supply token allowances; `farm_budgets` overrides
the token allowance. After the free month, no paid plan returns 402 `plan_required`; the farmer
can subscribe to Liv or a camera plan, or use their own provider key. A consumed allowance
returns 429 `budget_exceeded`. Legacy API-token principals keep the historical
`LLM_MONTHLY_TOKEN_BUDGET` fallback and farm override behavior for existing installs.

`GET /v1/voice/live` upgrades a session-authenticated WebSocket and proxies Gemini Live JSON
frames. Core forces `VOICE_MODEL=gemini-3.8-live` and `VOICE_LOCATION=us-central1`; clients
send BidiGenerateContent setup, audio and tool-response frames. OAuth stays in the upstream
authorization header. Connected seconds persist to `voice_usage` every second and on close;
concurrent connections share the allowance, including the free month's single pool.
Reaching it closes with 4402. A farm without a paid plan or free month receives HTTP 402
before upgrade. Upstream disconnection ends the client connection.

`GET /v1/voice/agent` uses the same session, farm membership and voice allowance checks.
Set `VOICE_AGENT_ID` to the Liv ElevenLabs agent and reuse `ELEVENLABS_API_KEY`.
Core fetches a signed WebSocket URL with its key; neither credential reaches the client.
ElevenLabs text frames pass through verbatim in both directions, including queued client
frames sent before the upstream opens. Usage is stored as `elevenlabs:<agentId>` in
`voice_usage`, sharing the Gemini allowance and 4402 close behavior. Either socket closing
ends the call. Missing key or agent configuration returns 503 `not_configured`; a failed
signed-URL request returns 502 `upstream_error` before upgrade and creates no usage row.
The `/v1/voice/live` endpoint remains available for released desktop clients.

The Liv agent itself (what Liv is told, its voice, and its five client tools) is defined in
`api/src/liv-voice-agent.ts`. `bun run --filter '@core/api' voice:setup -- --print` shows what
would be sent. With `ELEVENLABS_API_KEY` set, `voice:setup` creates the agent and its tools in
ElevenLabs and prints the id to use as `VOICE_AGENT_ID`; with `VOICE_AGENT_ID` also set it
updates that agent and only the tools that agent already uses. A run that fails removes the tools
it created. The tools run on the farm's own computer, so nothing in ElevenLabs reaches farm data
directly. `deploy/provision.sh` carries the agent's id as the default `VOICE_AGENT_ID`.

The remaining local-stack instructions below apply to a server or CI machine.

The tests need no Docker, because they run Postgres in-process through PGlite:

```sh
bun run --filter '@core/api' test
```

To run the full stack on a machine that has Docker:

```sh
cp core/.env.example core/.env   # then set ELECTRIC_SECRET and the LLM settings
docker compose -f core/docker-compose.yml --env-file core/.env up --build
curl localhost:8080/healthz
```

The API runs migrations on start: first the `@liv/schema` Postgres migrations, then
`core/api/migrations/*.sql`. The admin CLI needs `DATABASE_URL`:

```sh
bun core/api/src/cli.ts migrate
bun core/api/src/cli.ts issue-token <farm-uuid> "Farm PC"   # prints the token once; only its SHA-256 is stored
bun core/api/src/cli.ts set-budget <farm-uuid> 5000000
```

Paste the token into Liv's sync settings. Liv then passes it to
`createSyncEngine({ coreUrl, token, ... })`.

## Environment

| Variable                   | Used by       | Notes                                                                                                           |
| -------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | api, cli      | Postgres URL. On Cloud Run use the Cloud SQL socket form `postgres://user:pass@/liv?host=/cloudsql/<instance>`. |
| `ELECTRIC_URL`             | api           | Internal Electric URL, e.g. `http://electric:3000`.                                                             |
| `ELECTRIC_SECRET`          | api, electric | Shared secret; Electric rejects shape requests that lack it. **Secret.**                                        |
| `CORE_STATIC_TOKENS`       | api           | Development only: `token:farm-uuid,...`. Leave empty in production.                                             |
| `CORE_ADMIN_TOKEN`         | api           | Optional owner review token. Empty disables `/admin` and `/v1/admin/*`. **Secret.**                             |
| `CORE_FEEDBACK_EMAIL`      | api           | Optional address for feedback and shared-build notices through `MAIL_PROVIDER`.                                 |
| `LLM_UPSTREAM_URL`         | api           | e.g. `https://api.openai.com` or `https://api.anthropic.com`. Without it `/v1/llm/*` returns 503.               |
| `LLM_UPSTREAM_API_KEY`     | api           | Core's provider key. **Secret.**                                                                                |
| `LLM_UPSTREAM_AUTH`        | api           | `google` (Vertex OAuth), `authorization` (Bearer), or `x-api-key`.                                              |
| `LLM_MONTHLY_TOKEN_BUDGET` | api           | Default per-farm monthly token budget (input + output). Default 2,000,000.                                      |
| `CORE_MIGRATE_ON_START`    | api           | `false` turns off migrating on boot.                                                                            |
| `PORT`                     | api           | Default 8080.                                                                                                   |
| `CORE_VERSION`             | api           | Reported by `/healthz`.                                                                                         |
| `STRIPE_SECRET_KEY`        | api           | Stripe key; billing routes are off without it. **Secret.**                                                      |
| `STRIPE_WEBHOOK_SECRET`    | api           | Signing secret of the Stripe webhook endpoint. **Secret.**                                                      |
| `STRIPE_AUTOMATIC_TAX`     | api           | `true` enables Stripe Tax on checkout.                                                                          |
| `BILLING_SUCCESS_URL`      | api           | Default checkout success redirect. `BILLING_CANCEL_URL` is the cancel redirect.                                 |
| `CORE_CORS_ORIGINS`        | api           | Comma-separated browser origins.                                                                                |
| `MAIL_PROVIDER`            | api           | `resend`; needs `MAIL_API_KEY` (**secret**) and `MAIL_FROM`.                                                    |
| `PUBLIC_SITE_URL`          | api           | Site linked from mails. `LIV_DOWNLOAD_URL` is the download link; `ORDERS_EMAIL` gets hardware orders.           |
| `TERMS_VERSION`            | api           | Current terms version.                                                                                          |
| `GOOGLE_CLIENT_IDS`        | api           | Comma-separated Google OAuth client IDs accepted by `/v1/auth/google`; unset disables it (503).                 |
| `GCP_PROJECT`              | api           | With `LLM_UPSTREAM_AUTH=google`: Vertex project. Also `LLM_DEFAULT_MODEL`, `VOICE_MODEL`, `VOICE_LOCATION`.     |
| `ELEVENLABS_API_KEY`       | api           | ElevenLabs server API key, shared by the website demo and authenticated agent gateway. **Secret.**              |
| `VOICE_AGENT_ID`           | api           | Liv ElevenLabs agent ID for `/v1/voice/agent`; unset disables the gateway (503).                                |

Keep these in Secret Manager: the Postgres password (inside `DATABASE_URL`), `ELECTRIC_SECRET`,
the Stripe secrets, `MAIL_API_KEY`, `CORE_ADMIN_TOKEN` and `LLM_UPSTREAM_API_KEY`.

## Deploy to GCP (Cloud Run + Cloud SQL)

Everything lives in project `agrointel-dd8f6`, region `europe-north1`, one set per environment
(`staging`, `production`). Scripts in `core/deploy/` only run light `gcloud` commands locally;
images are built on Cloud Build or in GitHub Actions.

**`ENV=<env> core/deploy/provision.sh`** is idempotent and never deletes anything. It creates or
converges:

- Artifact Registry repo `liv-core` (image `core-api`).
- Cloud SQL Postgres 17 `liv-core-<env>` with `cloudsql.logical_decoding=on`, database and
  user `liv` (granted `REPLICATION` by the one-shot Cloud Run job `liv-core-<env>-dbinit`).
  Staging is `db-f1-micro` without backups; production is `db-custom-1-3840` with daily backups
  (14 kept), point-in-time recovery, deletion protection and `max_connections=200`, which covers
  ten API instances with five connections each while a rollout overlaps two revisions.
- Secrets `liv-core-<env>-{DB_PASSWORD,DATABASE_URL,ELECTRIC_DATABASE_URL,ELECTRIC_SECRET,
  STRIPE_SECRET_KEY,STRIPE_WEBHOOK_SECRET,MAIL_API_KEY}`. Database and Electric secrets are
  generated; the others get the placeholder `unset` unless passed as `SECRET_<NAME>=...`.
- Runtime service account `liv-core-<env>` (Cloud SQL client, secret accessor, Vertex user).
- Electric `liv-electric-<env>`: Cloud Run, internal ingress, one always-on instance, with a
  `cloud-sql-proxy` sidecar for the replication TCP connection. Its shape log is ephemeral;
  after a restart clients get `409 must-refetch` and resync.
- VPC `liv-<env>` with Private Google Access and a private `run.app` DNS zone. The API uses
  Direct VPC egress (private ranges) into it, which is what makes its calls to Electric count as
  internal.
- API `liv-core-<env>`: public Cloud Run, Cloud SQL attached, secrets as env, 3600 s timeout
  (voice WebSockets). Staging runs 0 to 2 instances with 512 MiB, production 1 to 10 with 1 GiB,
  both at 80 requests per instance. It migrates on start; instances that start together take
  turns behind a Postgres advisory lock. Non-secret settings default to staging values; production
  requires `PUBLIC_SITE_URL`, `CORE_CORS_ORIGINS`, `BILLING_SUCCESS_URL`, `BILLING_CANCEL_URL`.
- GitHub Actions access: workload identity pool `liv-github` / provider `github` (repo
  `kristianvast/liv` only) and deployer `liv-core-deployer` (Cloud Run developer, Artifact
  Registry writer).

On the first run it builds an image with `core/deploy/build.sh`. Later runs keep the running
image unless `IMAGE=` is set.

**Shipping code.** `.github/workflows/core-deploy.yml` runs the `@core/api` typecheck and tests,
builds the image in the runner, runs `gcloud run deploy liv-core-<env>` (image and
`CORE_VERSION` only) and smoke-tests `/health`. Cloud Run's front end reserves paths ending in
`z` on `run.app`, so `/healthz` never reaches the container there; `/health` is the same handler. Pushes to `main` that touch `core/**` or
`packages/schema/**` deploy staging. Run the workflow by hand to choose an environment;
production waits for approval in the `production` GitHub Environment. Repo variables:
`GCP_PROJECT`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`. To ship the local working tree
without Actions, run `ENV=staging core/deploy/deploy.sh` (Cloud Build, then deploy, then smoke).

**Production.** The public address `https://api.agrointel.no` is a Cloud Run domain mapping to
`orbit-core-production`; the website and every installed Liv use that address, so the service
behind it can change without a new release. Production uses the live Stripe key with Stripe Tax on
(`STRIPE_AUTOMATIC_TAX=true`, the default for production in `provision.sh`); Stripe adds tax only
for the places the account is registered in (Stripe dashboard, Tax > Registrations), and it picks
the rate from the buyer's billing country. Every price is the amount before tax:
`stripe-setup.ts` gives prices `tax_behavior=exclusive`, plans the business-software tax code and
the box and cameras the physical-goods one, so tax is always added on top of the listed price.

Registrations decide who is charged. Norway (`standard`) is listed. A company outside the EU owes
the buyer's country's VAT on plans sold to EU buyers without a VAT number from the first sale, and
one EU non-Union one-stop-shop registration covers all 27 countries (Irish Revenue takes it at
`ros.ie/vatoss-web`). Once it is held, list it with
`POST /v1/tax/registrations` (`country=IE`, `country_options[ie][type]=oss_non_union`,
`active_from=now`, or the country it was made in): buyers without a VAT number then get their own
country's rate and buyers with a valid one get reverse charge. Check any country with
`POST /v1/tax/calculations` and a billing country before and after. Staging keeps its own test-mode Stripe key. To ship a
commit to production, run the workflow by hand with `environment=production`, or re-converge
with the image built for that commit:

```sh
ENV=production PUBLIC_SITE_URL=https://agrointel.no \
  CORE_CORS_ORIGINS=https://agrointel.no,https://www.agrointel.no \
  BILLING_SUCCESS_URL='https://agrointel.no/account/?checkout=success' \
  BILLING_CANCEL_URL='https://agrointel.no/account/?checkout=cancel' \
  IMAGE=europe-north1-docker.pkg.dev/agrointel-dd8f6/liv-core/core-api:<12-char sha> \
  bash core/deploy/provision.sh
```

Never edit `provision.sh` while it runs: bash reads a script as it goes. A domain mapping cannot
be pointed at another service in place; delete it and create it again, and expect the address to
keep reaching the old service for a few minutes while the certificate is issued. To see which
service answers, request `/health?probe=<id>` and look that id up in the Cloud Run request log.

**Stripe.** `ENV=<env> core/deploy/stripe-webhook.sh` registers `<api>/v1/billing/webhook`
once, using the key in that environment's `STRIPE_SECRET_KEY` secret. It stores the signing
secret, rolls the API, and runs `stripe-setup.ts` if prices are missing.

After deploying, issue one token per farm install (`cli.ts issue-token`).

## Operational limits

- **Budget accuracy.** The budget is checked before each request, so one in-flight request can
  overshoot it. There is no per-model price weighting and no model allowlist yet.
- **Token management.** No admin UI or API for tokens beyond the CLI. Revocation works by setting
  `api_tokens.revoked_at`.
- **Rate limiting.** One network address gets ten sign-ups and ten password-reset requests an
  hour, one email gets ten failed sign-ins in 15 minutes, and feedback is capped at 20 a day; all
  are counted in Postgres, so they hold across instances. A request with no `x-forwarded-for`
  (local and test servers) is not limited by address. There is no limit per farm token or per
  session on the model gateway beyond the monthly budget, and the website voice demo's burst
  limit is kept per instance (its daily cap is in Postgres).
- **Password hashing.** Three argon2id hashes run at once per instance (about 64 MiB each); more
  wait their turn, so a burst of sign-ups is slower, never out of memory.
- **Request size.** `/v1/changes` takes 8 MiB, `/v1/llm/*` 32 MiB, chat sync 1 MiB. A model call
  is cut off after ten minutes.
- **Phone relay needs one instance.** `/v1/relay/host` (Liv on the farm PC) and
  `/v1/relay/client` (the phone) meet in the memory of one instance. With several instances a
  phone that lands on another one is told `pc_offline` and has to retry. Before the phone app is
  released, move the registry to shared storage or give the relay its own single-instance service.
- **Budgets are checked, not reserved.** Calls that start together can each pass the same budget
  or voice-allowance check.
- **Unverified locally.** The Docker image and compose file have not been run on this machine
  (Docker is not allowed on the dev Mac). Verify them in CI.
