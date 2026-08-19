/**
 * cwa visible-thread export — page-world boot.
 *
 * chrome.js toolbar should dispatch (on window or a bubbling target):
 *   cwa:copy     → clipboard markdown of the **visible thread**
 *   cwa:save-md  → download .md (YAML frontmatter + visible thread)
 *   cwa:save-zip → best-effort zip: chat.md + MANIFEST.md + manifest.json
 *                      + bounded visible media/ (no private conversation JSON)
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

  function emitDuplicate(action) {
    var Ev = global.CustomEvent || (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!Ev || typeof global.dispatchEvent !== "function") {
      return;
    }
    global.dispatchEvent(new Ev("cwa:export-status", {
      bubbles: true,
      detail : {
        action : action,
        ok     : false,
        code   : "duplicate",
        message: "Export already in progress",
      },
    }));
  }

  function boot() {
    if (global.__cwaExportBooted) {
      return;
    }
    global.__cwaExportBooted = true;

    var inflight = Object.create(null);
    async function downloadWithCompanion(blob, filename, doc) {
      var bridge;
      var result;
      try {
        bridge = global.CwaNativeBridge;
        if (bridge && typeof bridge.saveFile === "function") {
          result = await bridge.saveFile({
            filename: filename,
            blob    : blob,
            mime    : blob && blob.type,
          });
          if (result && result.ok) {
            return true;
          }
        }
      } catch (err) {
        // Native companion failures must fall back to the browser download.
      }
      try {
        return await core.triggerDownload(blob, filename, doc);
      } catch (err) {
        return false;
      }
    }

    var exporter = core.createExporter({
      window    : global,
      document  : global.document,
      location  : global.location,
      fetch     : bindFetch(),
      clipboard : global.navigator && global.navigator.clipboard,
      JSZip     : global.JSZip,
      download  : downloadWithCompanion,
    });

    global.CwaExport = exporter;

    function emitFailure(action) {
      var Ev;
      try {
        Ev = global.CustomEvent || (typeof CustomEvent === "function" ? CustomEvent : null);
        if (!Ev || typeof global.dispatchEvent !== "function") {
          return;
        }
        global.dispatchEvent(new Ev("cwa:export-status", {
          bubbles: true,
          detail : {
            action : action,
            ok     : false,
            code   : "error",
            message: "Export failed",
          },
        }));
      } catch (_err) {
        /* status is best-effort */
      }
    }

    function run(action, method) {
      return function (event) {
        if (event && event.detail && typeof event.detail === "object") {
          event.detail.handled = true;
        }
        if (inflight[action]) {
          emitDuplicate(action);
          return;
        }
        inflight[action] = true;
        Promise.resolve().then(function () {
          return exporter[method]();
        }).then(function () {
          /* exporter emits its own success/failure status */
        }, function () {
          emitFailure(action);
        }).then(function () {
          inflight[action] = false;
        }, function () {
          inflight[action] = false;
        });
      };
    }

    var onCopy    = run("copy", "copy");
    var onSaveMd  = run("save-md", "saveMarkdown");
    var onSaveZip = run("save-zip", "saveZip");
    global.addEventListener("cwa:copy", onCopy);
    global.addEventListener("cwa:save-md", onSaveMd);
    global.addEventListener("cwa:save-zip", onSaveZip);
  }

  boot();
})(typeof window !== "undefined" ? window : globalThis);
