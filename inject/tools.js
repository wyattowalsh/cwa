/**
 * cwa tool adapters — palette-invoked local actions only.
 * No default network. No hidden conversation JSON scrape.
 */
(function (global) {
  "use strict";

  var CATALOG = [
    {
      id      : "copy-visible",
      title   : "Copy visible thread",
      event   : "cwa:copy",
      keywords: "clipboard markdown",
    },
    {
      id      : "save-md",
      title   : "Save Markdown",
      event   : "cwa:save-md",
      keywords: "download md",
    },
    {
      id      : "save-zip",
      title   : "Save ZIP",
      event   : "cwa:save-zip",
      keywords: "archive media",
    },
    {
      id      : "diagnostics",
      title   : "Diagnostics snapshot",
      action  : "diagnostics",
      keywords: "safe mode selectors",
    },
  ];

  function catalog() {
    return CATALOG.map(function (item) {
      return {
        id      : item.id,
        title   : item.title,
        event   : item.event || null,
        action  : item.action || null,
        keywords: item.keywords,
      };
    });
  }

  function find(id) {
    var i;
    for (i = 0; i < CATALOG.length; i += 1) {
      if (CATALOG[i].id === id) {
        return CATALOG[i];
      }
    }
    return null;
  }

  function emit(name, root) {
    root = root || global;
    var Ev = root.CustomEvent || (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!Ev || typeof root.dispatchEvent !== "function") {
      return false;
    }
    root.dispatchEvent(new Ev(name, { bubbles: true, detail: { source: "tools" } }));
    return true;
  }

  function run(id, context) {
    var item = find(id);
    var diag;
    var snap;
    context = context || {};
    if (!item) {
      return { ok: false, error: "unknown_tool" };
    }
    if (item.event) {
      if (!emit(item.event, context.window || global)) {
        return { ok: false, error: "event_unavailable" };
      }
      return { ok: true, id: item.id, event: item.event };
    }
    if (item.action === "diagnostics") {
      diag = global.CwaDiagnostics;
      snap = diag && typeof diag.snapshot === "function"
        ? diag.snapshot({
          probe     : context.probe || {},
          lifecycle : context.lifecycle || {},
          safeMode  : context.safeMode || {},
          href      : context.href || "",
        })
        : { schema: "cwa.diagnostics.v1", error: "diagnostics_unavailable" };
      if (diag && typeof diag.emit === "function") {
        diag.emit({ window: context.window || global }, snap);
      }
      return { ok: true, id: item.id, diagnostics: snap };
    }
    return { ok: false, error: "unhandled_tool" };
  }

  var api = {
    CATALOG: CATALOG,
    catalog: catalog,
    find   : find,
    run    : run,
  };

  global.CwaTools = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
