# Product analytics

The desktop app sends one anonymous first-launch report through Core to Barnstar's EU
PostHog project. It contains a random install ID, operating system (Windows, macOS or Linux)
and app version. The ID and successful-send marker are kept in the app's local storage,
survive updates, and are removed when that storage is cleared. Offline attempts retry on a
later launch with the same ID. Browser development does not send this report.

This report contains no account ID, email, name, IP address, farm records or conversation
content. Core uses a hashed network address only for its local abuse limit; the address is
not forwarded to PostHog. The install ID is never linked to a signed-in account.

When using Core, account creation, checkout starts, paid checkout completions and metered
Orion/voice usage are also reported under the Core user ID. These events contain only
source/method, plan/interval/type, model, token counts, HTTP status or voice seconds.
They contain no email, name, IP address or message content. Usage with a farmer's own AI
provider key stays outside this Core analytics path.

This does not change the separate setting for sharing anonymised footage and outcomes.
Core analytics is disabled when its operator leaves `POSTHOG_KEY` unset.
