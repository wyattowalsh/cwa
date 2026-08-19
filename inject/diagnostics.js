/**
 * cwa diagnostics — selector/lifecycle snapshot with redaction.
 * Never includes conversation text, cookies, tokens, or Authorization.
 */
(function (global) {
  "use strict";

  var FORBIDDEN_KEYS = /cookie|authorization|bearer|token|accessToken|session|conversation\.json|password/i;
  var LIFECYCLE_STATES = {
    idle      : true,
    booting   : true,
    ready     : true,
    navigating: true,
    degraded  : true,
    safe      : true,
  };
  var SELECTOR_KEYS = ["sidebar", "message", "composer", "thinking", "citation", "fileCard"];

  function isForbiddenKey(key) {
    return FORBIDDEN_KEYS.test(String(key || ""));
  }

  function redactValue(value) {
    if (value == null) {
      return value;
    }
    if (typeof value === "string") {
      if (FORBIDDEN_KEYS.test(value)) {
        return "[redacted]";
      }
      if (value.length > 120) {
        return value.slice(0, 117) + "...";
      }
      return value;
    }
    if (typeof value !== "object") {
      return value;
    }
    return redact(value);
  }

  function redact(input) {
    var out = Array.isArray(input) ? [] : {};
    var key;
    for (key in input) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) {
        continue;
      }
      if (isForbiddenKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactValue(input[key]);
    }
    return out;
  }

  function lifecycleState(lifecycle) {
    var state;
    try {
      if (lifecycle && typeof lifecycle.getState === "function") {
        state = lifecycle.getState();
      } else if (lifecycle && typeof lifecycle === "object") {
        state = lifecycle.state;
      } else {
        state = lifecycle;
      }
    } catch (err) {
      state = null;
    }
    return typeof state === "string"
      && Object.prototype.hasOwnProperty.call(LIFECYCLE_STATES, state)
      ? state
      : "unknown";
  }

  function safeModeActive(safeMode) {
    try {
      if (typeof safeMode === "boolean") {
        return safeMode;
      }
      if (!safeMode) {
        return false;
      }
      if (safeMode.active === true) {
        return true;
      }
      return typeof safeMode.isActive === "function" && Boolean(safeMode.isActive());
    } catch (err) {
      return false;
    }
  }

  function selectorSnapshot(probe) {
    var out = {};
    var i;
    var name;
    var row;
    var selector;
    var count;
    for (i = 0; i < SELECTOR_KEYS.length; i += 1) {
      name = SELECTOR_KEYS[i];
      row = probe && probe[name];
      selector = row && typeof row.selector === "string" ? row.selector.slice(0, 120) : null;
      count = row && typeof row.count === "number" && isFinite(row.count) ? row.count : 0;
      out[name] = {
        hit     : Boolean(row && row.hit),
        selector: selector,
        count   : count,
        critical: Boolean(row && row.critical),
      };
    }
    return out;
  }

  function snapshot(input) {
    input = input || {};
    var safeActive = safeModeActive(input.safeMode);
    return {
      product  : "cwa",
      schema   : "cwa.diagnostics.v1",
      lifecycle: lifecycleState(input.lifecycle),
      safeMode : safeActive,
      code     : safeActive ? "safe_mode" : "ok",
      selectors: selectorSnapshot(input.probe),
      hrefKind : classifyHref(input.href),
    };
  }

  function classifyHref(href) {
    var parsed;
    if (!href) {
      return "other";
    }
    try {
      parsed = new URL(String(href), "https://chatgpt.com");
    } catch (err) {
      return "other";
    }
    if (/^\/c(?:\/|$)/.test(parsed.pathname)) {
      return "conversation";
    }
    if (/^\/settings(?:\/|$)/.test(parsed.pathname)) {
      return "settings";
    }
    return "other";
  }

  function emit(deps, data) {
    var win = deps && deps.window;
    var Ev  = (win && win.CustomEvent) || (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!Ev || !win || typeof win.dispatchEvent !== "function") {
      return data;
    }
    win.dispatchEvent(new Ev("cwa:diagnostics", { bubbles: true, detail: data }));
    return data;
  }

  var api = {
    redact       : redact,
    snapshot     : snapshot,
    classifyHref : classifyHref,
    emit         : emit,
    isForbiddenKey: isForbiddenKey,
  };

  global.CwaDiagnostics = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
