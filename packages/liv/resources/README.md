# What Liv is told

Everything that shapes how Liv acts, in the order she reads it. Edit the file, restart Liv
(`bun run --filter '@liv/agent' dev` restarts on save), and start a new conversation.

## In every chat

| Order | File                                                                    | What it holds                                                               |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1     | `prompt/1-role.md`                                                      | Who Liv is: the farmer's helper for anything, and a builder                 |
| 2     | `prompt/2-how-you-work.md`                                              | Tools, failures, memory, the web                                            |
| 3     | `prompt/3-ask-first.md`                                                 | What needs the farmer's yes; web pages are strangers                        |
| 4     | `prompt/4-the-liv-app.md`                                               | Screens, modules, connections, which skill to follow, account               |
| 5     | `prompt/5-feedback-and-sharing.md`                                      | Feedback to the Liv team and sharing useful builds                          |
| 6     | `../../protocol/src/about.ts`                                           | What Liv knows about Agrointel and herself (shared with voice)              |
| 7     | `../src/agent/prompt.ts`                                                | "This computer": system, shell, version, folders (built per computer)       |
| 8     | `AGENTS.md`                                                             | The farmer, the data model, the one-wearable rule, animal health            |
| 9     | `<workspace>/AGENTS.md`, `<workspace>/memory/farm.md`, `memory/user.md` | This farm's own notes and what Liv remembered                               |
| 10    | `skills/*/SKILL.md`                                                     | Only each skill's name and description; Liv reads the body when she uses it |

`../src/agent/prompt.ts` puts 1 to 7 together. A new file in `prompt/` must be added there.

## Elsewhere

- Tool descriptions (what each tool is for, read on every turn): `../src/agent/tools.ts` and its
  neighbours in `../src/agent/`. `feedback_send` and `share_build` are in `tools.ts`.
- On a voice call: `../../../core/api/src/liv-voice-prompt.md`, then `about.ts` and the prices.
  A change reaches calls when the Core deploy workflow runs (a push to main that touches Core),
  or by hand with `bun run --filter '@core/api' voice:setup`.
- Catalog skills a farm installs: `../../../skills/`.

## Seeing what she got

- `bun run liv:context` (from the repository root) prints the whole context of a new conversation
  on a fresh install: each part with its file and size, every tool description, then the full
  prompt. `bun run liv:context | nvim -` opens it.
- A running Liv writes the same report for its latest conversation to `<data-dir>/liv-context.md`
  (`packages/liv/.dev-data/liv-context.md` in dev). It includes this farm's memory and skills.
- What Liv said and did: one JSONL file per conversation in `<data-dir>/sessions/`.
