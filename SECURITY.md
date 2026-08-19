# Security model (Waves 0–5)

- Provider DOM is untrusted. Prompt text cannot authorize local actions (cookie export, endpoint calls).
- Visible-thread ZIP must not include cookies, authorization headers, session storage, or other-thread data.
- Media fetches use `credentials: "omit"` and `redirect: "error"`. Destinations are limited to the page origin or exactly `https://files.oaiusercontent.com` at its default port; private provider endpoints are denied, response URLs are revalidated, and count/size/time caps still apply.
- JSZip is vendored; do not execute archive contents.
- Official full-history path: ChatGPT Settings → Data Controls → Export data.
