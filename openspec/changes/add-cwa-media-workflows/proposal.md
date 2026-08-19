# Change: add-cwa-media-workflows

Visible-DOM workflow: images in mounted turns plus file-card/download links under `main`, excluding navigation, CWA chrome, and CSS-hidden ancestors. “Visible” means mounted and not CSS-hidden, not viewport intersection.

Fetches allow only same-origin destinations or exactly `https://files.oaiusercontent.com` at its default port, use `credentials: "omit"` and `redirect: "error"`, and retain private-path denials and count/size/deadline caps. Manifest `media.workflow` remains `visible-dom`.
