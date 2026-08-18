/**
 * cwa visible-thread export — page-world boot.
 *
 * chrome.js toolbar should dispatch (on window or a bubbling target):
 *   cwa:copy     → clipboard markdown of the **visible thread**
 *   cwa:save-md  → download .md (YAML frontmatter + visible thread)
 *   cwa:save-zip → best-effort zip: chat.md + optional conversation.json
 *                      + fetched media/ + MANIFEST.md (known gaps)
 *
 * This is not “export everything”. Full account archive:
 * ChatGPT Settings → Data Controls → Export data.
 *
 * Requires inject order: vendor/jszip.min.js → export-core.js → export.js
 * Tests: `pnpm test`
 *
 * No innerHTML assignment, no eval.
 */
(function (global) {
  "use strict";

  var core = global.CwaExportCore;
  if (!core || typeof core.createExporter !== "function") {
    return;
  }

  function bindFetch() {
    if (typeof global.fetch !== "function") {
      return null;
    }
    return global.fetch.bind(global);
  }

  function boot() {
    if (global.__cwaExportBooted) {
      return;
    }
    global.__cwaExportBooted = true;

    var inflight = Object.create(null);
    var exporter = core.createExporter({
      window    : global,
      document  : global.document,
      location  : global.location,
      fetch     : bindFetch(),
      clipboard : global.navigator && global.navigator.clipboard,
      JSZip     : global.JSZip,
      download  : core.triggerDownload,
    });

    global.CwaExport = exporter;

    function run(action, method) {
      return function () {
        if (inflight[action]) {
          return;
        }
        inflight[action] = true;
        Promise.resolve(method.call(exporter)).finally(function () {
          inflight[action] = false;
        });
      };
    }

    var onCopy    = run("copy", exporter.copy);
    var onSaveMd  = run("save-md", exporter.saveMarkdown);
    var onSaveZip = run("save-zip", exporter.saveZip);
    global.addEventListener("cwa:copy", onCopy);
    global.addEventListener("cwa:save-md", onSaveMd);
    global.addEventListener("cwa:save-zip", onSaveZip);
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener("cwa:copy", onCopy);
      global.document.addEventListener("cwa:save-md", onSaveMd);
      global.document.addEventListener("cwa:save-zip", onSaveZip);
    }
  }

  boot();
})(typeof window !== "undefined" ? window : globalThis);
