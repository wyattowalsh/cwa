/**
 * cwa tool adapters — palette-invoked local actions only.
 * No default network. No hidden conversation JSON scrape.
 */
(function (global) {
  "use strict";

  var CATALOG = Object.freeze([
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
  ].map(function (item) {
    return Object.freeze(item);
  }));

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

  function canDispatch(root) {
    root = root || global;
    var Ev = root.CustomEvent || (typeof CustomEvent === "function" ? CustomEvent : null);
    return Boolean(Ev && typeof root.dispatchEvent === "function");
  }

  function emit(name, root) {
    var detail = { source: "tools" };
    root = root || global;
    var Ev = root.CustomEvent || (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!Ev || typeof root.dispatchEvent !== "function") {
      return false;
    }
    try {
      root.dispatchEvent(new Ev(name, { bubbles: true, detail: detail }));
    } catch (_error) {
      return false;
    }
    return detail.handled === true;
  }

  function run(id, context) {
    var item = api.find(id);
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
      if (!diag || typeof diag.snapshot !== "function") {
        return { ok: false, error: "diagnostics_unavailable" };
      }
      try {
        snap = diag.snapshot({
          probe     : context.probe || {},
          lifecycle : context.lifecycle || {},
          safeMode  : context.safeMode || {},
          href      : context.href || "",
        });
      } catch (_error) {
        return { ok: false, error: "diagnostics_unavailable" };
      }
      if (
        snap == null ||
        typeof snap !== "object" ||
        Array.isArray(snap) ||
        snap.schema !== "cwa.diagnostics.v1"
      ) {
        return { ok: false, error: "diagnostics_unavailable" };
      }
      if (snap.error) {
        return { ok: false, error: "diagnostics_unavailable" };
      }
      if (!diag || typeof diag.emit !== "function") {
        return { ok: false, error: "diagnostics_unavailable" };
      }
      if (!canDispatch(context.window || global)) {
        return { ok: false, error: "diagnostics_unavailable" };
      }
      try {
        diag.emit({ window: context.window || global }, snap);
      } catch (_error) {
        return { ok: false, error: "diagnostics_unavailable" };
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
