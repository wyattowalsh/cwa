# Known limitations (visible-thread export)

These always apply even when no extra gaps are detected:

- Unloaded / virtualized turns are omitted
- Closed canvases are omitted
- Deep Research panels that are not mounted are omitted
- Code Interpreter files are included only when a **visible** URL fetch succeeds under caps
- Hidden thinking is omitted unless the thinking block is in the DOM
- The native companion is optional; this repository defines the page-world protocol but ships no native host or sidecar
- Safe mode protects CWA chrome only; it does not alter, repair, or replace ChatGPT page behavior, and export remains available
- File-card export requires a URL exposed by mounted visible DOM; hidden, expired, or inaccessible URLs are omitted and recorded
- This is not an account archive — use ChatGPT Settings → Data Controls → Export data
- Native companion is optional; missing or failing hosts use the browser Blob download
- Safe mode limits sidebar resize and minimap only; export events stay available
- File-card media is included only when a visible `main` URL fetch succeeds under the same caps
- Media time caps are checked before each fetch; an already in-flight request is not aborted
