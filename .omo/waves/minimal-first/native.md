# Minimal-first: native builds (Windows, macOS, Linux)

## Changes
- `src-tauri/Cargo.toml` `[profile.release]`: `lto = true`, `codegen-units = 1`, `opt-level = "s"`,
  `strip = true`. Smaller installers and updater payloads, faster cold start. No `panic = "abort"`.
  Applies to release.yml builds only; CI's `tauri build --debug` is unchanged.
- `tauri-plugin-single-instance = "2"` (desktop-only target deps), registered FIRST in `lib.rs`
  under `#[cfg(desktop)]`, per v2.tauri.app/plugin/single-instance. A second launch unminimizes,
  shows and focuses `main`, then exits, so two Orion sidecars never share one data dir/SQLite writer.
- `tauri.conf.json`: window `backgroundColor: "#f6f3ec"` (= light `--bg-canvas` in tokens.css), so
  no white flash before React paints. Dark-theme users still see the light canvas briefly.
  `bundle.macOS.minimumSystemVersion: "13.0"`, not 11.0: Bun binaries target macOS 13
  (oven-sh/bun#15873), so the Orion sidecar would not run lower. Targets and deb deps unchanged.
- Orion sidecar: `bun build --compile --minify --keep-names` in ci.yml and release.yml. Smaller
  binary, faster parse at startup. Orion's own code never reads function/class `.name` (grep only
  finds data fields like `tool.name`), and `--keep-names` protects dependencies that might.
- release.yml: `linux-arm64` (ubuntu-22.04-arm, aarch64-unknown-linux-gnu, bun-linux-arm64) plus
  `go2rtc_linux_arm64` in the download case.
- ci.yml macOS launch smoke: runs the debug binary from inside `bundle/macos/Orbit.app` (same
  binary as target/debug/orbit-desktop, but with a bundle id) using the default app data dir and a
  mock model. Polls up to 60s for an `orion` child (`pgrep -P`) with a 127.0.0.1 LISTEN socket
  (`lsof`), requires an HTTP status from curl, saves a `screencapture` artifact, quits with an
  AppleEvent (Cmd+Q path), then requires the app and the sidecar to both exit.
- ci.yml Linux: after the WebDriver smoke, fails if `target/debug/orion` still runs after 15s.
- Desktop specs: wdio no longer sets `ORION_SEED` (seeded rows would auto-enable modules). The
  spec requires built-in nav hrefs to be exactly `/`, `/chat`, `/settings` with no `/herd`,
  `/devices` or `/cameras`, keeps the mock chat round trip, and checks nav is still minimal after it.
  The old seeded-count assertion on Home is gone (fresh install has no animals).

## Verified locally
- `check:workflows`, `@orbit/e2e typecheck`, biome on .github/e2e desktop/src-tauri: all pass.
- tauri.conf.json validates against the Tauri CLI 2.12.4 schema: the CLI config loader accepted it,
  and a negative control (bad color + unknown macOS key) was rejected.

## Only CI can prove
- Rust compiles: single-instance API use, `get_webview_window`/`unminimize`/`show`/`set_focus`.
  The plugin needs Rust >= 1.90 (stable toolchain is fine).
- Minified sidecar still prints ORION_READY and writes resources (existing CI smoke step).
- macOS: osascript can quit the app by bundle id (lsregister runs first). If TCC blocks it, the step
  warns, falls back to SIGTERM, and the orphan check then fails.
- Linux: WebKitWebDriver closes Orbit gracefully, so RunEvent::Exit kills the sidecar.
- Fresh-install nav depends on the parallel modules work (UI hiding modules, Orion auto-enable).
- linux-arm64 release job (runner availability, apt deps, tauri-action on arm).

## Follow-up (not changed)
- Force-kill (SIGTERM/SIGKILL) of Orbit orphans the sidecar: lib.rs only kills it on
  RunEvent::Exit, and Orion has no parent-death watchdog (exit on stdin EOF or ppid change).
