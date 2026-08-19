# Design: media workflows

`collectVisibleFileCards` walks `main` for `a[download]`, `/files/` hrefs, and file-card test ids, excluding navigation, CWA chrome, and CSS-hidden ancestors. The `visible-dom` label means mounted and not CSS-hidden, not viewport intersection.

Media fetches allow only same-origin destinations or exactly `https://files.oaiusercontent.com` at its default port. They use `credentials: "omit"` and `redirect: "error"`, deny private provider paths, and revalidate the response URL before reading a Blob. Failures are recorded while Markdown still succeeds; no conversation JSON is harvested.
