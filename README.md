<div align="center">

<img src="apps/liv/src-tauri/icons/icon.svg" width="96" height="96" alt="Liv logo">

# Liv

### Ask for it. Liv builds it.

The open-source farm app for cattle and horses, made by Agrointel.<br>
It runs on your own computer, and its built-in AI assistant shapes it into what your farm needs.

[![Latest release](https://img.shields.io/github/v/release/kristianvast/liv?label=release&color=e88245)](https://github.com/kristianvast/liv/releases/latest)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-5ec28f)](LICENSE)
![Windows, macOS and Linux](https://img.shields.io/badge/runs%20on-Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-181612)

[**Download**](#download) · [Website](https://agrointel.no) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md)

<a href="https://agrointel.no/assets/video/ag-v11-orbit-motion/ag-v11-orbit-motion-light_audio.mp4"><img src="docs/media/liv-film.webp" width="100%" alt="A farmer asks Liv for a calving watch, and Liv builds the page, the camera view and the text alert"></a>

<sub>▶ <a href="https://agrointel.no/assets/video/ag-v11-orbit-motion/ag-v11-orbit-motion-light_audio.mp4">Watch the full film with sound</a> (55 seconds)</sub>

</div>

## Why Liv

- **It starts small.** A fresh install shows Home, Ask Liv and Settings. You add only the screens you use.
- **You say what you need.** Type or talk to Liv. It builds the pages, connections and automations for your farm.
- **Your data lives on your PC.** Records work offline. Sync to the cloud is optional.
- **Every change can be undone.** Each edit Liv makes is saved as a snapshot you can revert with one click.

> **Status:** early release. Interfaces, database tables and cloud endpoints may still change.

## Download

| System                              | Installer                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Windows** (x64)                   | [Liv-Windows.exe](https://github.com/kristianvast/liv/releases/latest/download/Liv-Windows.exe)                         |
| **macOS** (Apple Silicon)           | [Liv-macOS-Apple-Silicon.dmg](https://github.com/kristianvast/liv/releases/latest/download/Liv-macOS-Apple-Silicon.dmg) |
| **macOS** (Intel)                   | [Liv-macOS-Intel.dmg](https://github.com/kristianvast/liv/releases/latest/download/Liv-macOS-Intel.dmg)                 |
| **Linux** (x64)                     | [Liv-Linux-x64.AppImage](https://github.com/kristianvast/liv/releases/latest/download/Liv-Linux-x64.AppImage)           |
| **Linux** (ARM64, Debian or Ubuntu) | [Liv-Linux-arm64.deb](https://github.com/kristianvast/liv/releases/latest/download/Liv-Linux-arm64.deb)                 |

More formats (`.msi`, `.deb`) are on the [latest release](https://github.com/kristianvast/liv/releases/latest). Liv updates itself in the background.

**Getting started takes three steps:**

1. **Switch Liv on.** Create a free Liv account (30 days free, no card needed) or bring your own AI key or subscription.
2. **Tell Liv about your farm.** Dairy cattle, beef cattle or horses, and what you want to see first.
3. **Ask for what you need.** A calving watch, a dry-cow board, a connection to your milking system.

## What Liv can do

|                                 |                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 🐄 **Herd records**             | Add and find cattle and horses, and record inseminations, pregnancy checks, calvings, foalings and treatments.                     |
| 🧩 **Custom pages**             | Ask for a screen that fits your routine. Liv builds it, with a live card on Home.                                                  |
| 🔌 **Connections**              | Import CSV files, install verified add-ons from the [`skills/`](skills) catalog, or have Liv build a connector for your equipment. |
| 📷 **Barn cameras**             | Find ONVIF cameras on the barn network and watch them live on a barn map.                                                          |
| 🎙️ **Voice**                    | Talk to Liv hands-free and hear it answer.                                                                                         |
| 🖥️ **Other programs**           | Liv can operate herd or robot software on your PC that has no export, and use the web for you.                                     |
| 🧠 **Memory**                   | Liv remembers your barn layout, groups and routines between conversations.                                                         |
| ↩️ **Ask first, undo anything** | Liv asks before risky steps, and every change it makes can be reverted from Settings.                                              |

Liv knows real barn rules too: an animal wears a collar **or** a bolus **or** an ear tag sensor, never several at once.

## Your data stays yours

- Farm data lives in a local SQLite database on your computer and works without internet.
- Passwords and keys go to your operating system's keychain, never into the database or chat.
- Sign in only if you want cloud sync and to invite owners, managers, workers and viewers.
- Records map to the [ICAR ADE](https://github.com/adewg/ICAR) livestock data standard, so they are not locked into Liv.
- Feedback and shared builds are sent only after you say yes, and Liv refuses to upload anything that looks like a secret.

## Free and open source

Liv is free. Run it fully locally with your own AI key from providers such as Anthropic, OpenAI or Google, or create a free Liv account for a 30-day trial with no card. Optional paid plans cover cloud AI, voice minutes and sync: see [pricing](https://agrointel.no/pricing/).

## For developers

| Name          | What it is                                                         | Where it lives                 |
| ------------- | ------------------------------------------------------------------ | ------------------------------ |
| **Liv app**   | The desktop app (Tauri 2, React, TypeScript, Vite)                 | [`apps/liv`](apps/liv)         |
| **Liv agent** | The AI agent and local data server (Bun sidecar, SQLite writer)    | [`packages/liv`](packages/liv) |
| **Core**      | The optional cloud (Hono API, Postgres, sync, AI gateway, billing) | [`core/api`](core/api)         |

You need [Bun](https://bun.sh) 1.3+ and Node.js 22.19+. No Rust, Tauri or Docker is needed for browser development.

```bash
scripts/locked-install.sh              # install dependencies
bun run --filter '@liv/agent' dev      # terminal 1: the Liv agent with a demo farm
bun run --filter '@liv/app' dev        # terminal 2: the Liv app
```

```bash
bun run lint && bun run typecheck && bun run test
```

**Read more:** [Architecture](docs/ARCHITECTURE.md) · [Design system](apps/liv/DESIGN.md) · [Core cloud setup](core/README.md) · [Testing](docs/TESTING.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [CLA](CLA.md) · [Security](SECURITY.md)

## License

Liv is dual-licensed: open source under [AGPL-3.0-only](LICENSE), with a paid [commercial license](COMMERCIAL.md) from Agrointel for closed-source use. See [LICENSING.md](LICENSING.md) or write to [kristian@agrointel.no](mailto:kristian@agrointel.no).
