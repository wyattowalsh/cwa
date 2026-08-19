# Known limitations (visible-thread export)

These always apply even when no extra gaps are detected:

- Unloaded / virtualized turns are omitted
- Closed canvases are omitted
- Deep Research panels that are not mounted are omitted
- Hidden thinking is omitted unless the thinking block is in the DOM
- “Visible DOM” means mounted under `main`, outside navigation and CWA chrome, with no CSS-hidden ancestor (`hidden`, `display: none`, `visibility: hidden|collapse`, or `opacity: 0`); it does not mean viewport intersection
- File-card and Code Interpreter media require an exposed URL and a successful fetch from the page origin or the exact HTTPS host `files.oaiusercontent.com` at its default port; fetches omit credentials, reject redirects, and remain subject to count, size, and time caps
- A fired deadline aborts an in-flight fetch or Blob read; an unknown-length body can still materialize before its size is known
- The optional native envelope is not a sandbox: page-world code can call `__cwaNative.saveFile` directly, and this repository ships no native host or sidecar
- A missing or failing native host falls back to browser Blob download
- Safe mode limits CWA sidebar and minimap behavior; it does not alter the provider page, and export remains available
- This is not an account archive — use ChatGPT Settings → Data Controls → Export data
