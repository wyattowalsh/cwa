# AGENTS.md

## Cursor Cloud specific instructions

`cwa` is a [Pake](https://github.com/tw93/Pake) (Tauri v2) wrapper that packages
`chatgpt.com` into a desktop app. The code that actually lives in this repo is the
**inject layer** under `inject/` (`chrome.js` custom window chrome + minimap/sidebar,
`theme.css`, and the `export-core.js` / `export.js` visible-thread export feature),
plus the wrapper config `pake.cwa.json`. Day-to-day work is editing those files and
running the tests; the Tauri build only packages them.

### Lint / test
- `pnpm test` runs the full suite: `vitest run` (happy-dom) **and** `node --test inject/chrome.test.js`. It is Node-only, fast, and the primary dev loop. `pnpm test:watch` for watch mode. There is no separate lint step.

### Build (non-obvious)
- `pnpm pake:build` / `pnpm pake:install` pass `--targets app`, which is **macOS-only**. On the Linux cloud VM that fails with `No valid Linux target in "app"`. Build a Linux target instead:
  `pnpm exec pake --config pake.cwa.json --targets deb` (also valid: `appimage`, `rpm`, `zst`). Output is written to `./cwa.deb` (git-ignored).
- The build needs **Rust ≥ 1.85** (a transitive dep requires the `edition2024` cargo feature); the default toolchain in the base image was 1.83 and has been updated to stable in this environment. It also needs the Tauri v2 GTK/WebKit system libraries (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, etc.), which are baked into the environment. Do not add these to the update script.
- `pake` internally shells out with `npm` (it is pinned to a different pnpm) and installs Tauri deps into its own package dir under `node_modules/.pnpm/pake-cli*/`; the first Rust compile takes a few minutes, then it is cached.

### Run
- The built binary is `node_modules/.pnpm/pake-cli@*/node_modules/pake-cli/src-tauri/target/release/pake-cwa`. Launch it on the VM display, e.g. `DISPLAY=:1 <binary>`. Without a logged-in session `chatgpt.com` shows a Cloudflare "verify you are human" / login page — that is expected. The injected `Copy / MD / ZIP / Cmd` toolbar rendering in the top-right confirms the `inject/` layer is active.
