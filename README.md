# cwa

**cwa** (ChatGPT Web App) is a local macOS Pake wrapper around `https://chatgpt.com`. It is a separate app from official `ChatGPT.app` (bundle id `com.wyattowalsh.cwa`).

Visible-thread export is best-effort DOM snapshot only: copy, Markdown, and ZIP of `chat.md` + limitations manifest + bounded visible media. It does **not** call undocumented provider conversation APIs.

```bash
pnpm test
pnpm run pake:build
```

See `START_HERE.md` and `docs/planning/establish-cwa-foundation/`.
