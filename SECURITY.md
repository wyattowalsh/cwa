# Security model (Wave 1)

- Provider DOM is untrusted. Prompt text cannot authorize local actions (cookie export, endpoint calls).
- Visible-thread ZIP must not include cookies, authorization headers, session storage, or other-thread data.
- Media fetch uses `credentials: "omit"` and bounded count/size/time. Failed media is recorded, not retried via private APIs.
- JSZip is vendored; do not execute archive contents.
- Official full-history path: ChatGPT Settings → Data Controls → Export data.
