/**
 * cwa lifecycle — boot / navigate / ready / degraded / safe.
 * Does not fetch ChatGPT backends. Does not read cookies or tokens.
 */
(function (global) {
  "use strict";

  var STATES = {
    idle      : "idle",
    booting   : "booting",
    ready     : "ready",
    navigating: "navigating",
    degraded  : "degraded",
    safe      : "safe",
  };

  function createLifecycle(options) {
    options = options || {};
    var state   = STATES.idle;
    var lastHref = options.href || "";
    var listeners = [];

    function emit(from, to, reason) {
      var i;
      var detail = { from: from, to: to, reason: reason || "", href: lastHref };
      for (i = 0; i < listeners.length; i += 1) {
        listeners[i](detail);
      }
    }

    function setState(next, reason) {
      var from = state;
      if (from === next) {
        return from;
      }
      state = next;
      emit(from, next, reason);
      return state;
    }

    function boot() {
      if (state === STATES.safe) {
        return state;
      }
      setState(STATES.booting, "boot");
      setState(STATES.ready, "boot-complete");
      return state;
    }

    function noteHref(href) {
      href = String(href || "");
      if (href && href !== lastHref) {
        lastHref = href;
        if (state === STATES.safe) {
          emit(STATES.safe, STATES.safe, "spa-while-safe");
          return state;
        }
        setState(STATES.navigating, "spa");
        setState(STATES.ready, "spa-settled");
      }
      return state;
    }

    function degrade(reason) {
      if (state === STATES.safe) {
        return state;
      }
      return setState(STATES.degraded, reason || "degraded");
    }

    function enterSafe(reason) {
      return setState(STATES.safe, reason || "safe");
    }

    function recover() {
      if (state === STATES.degraded) {
        return setState(STATES.ready, "recover");
      }
      return state;
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (item) {
          return item !== fn;
        });
      };
    }

    return {
      STATES     : STATES,
      boot       : boot,
      noteHref   : noteHref,
      degrade    : degrade,
      enterSafe  : enterSafe,
      recover    : recover,
      subscribe  : subscribe,
      getState   : function () { return state; },
      getHref    : function () { return lastHref; },
    };
  }

  var api = { STATES: STATES, createLifecycle: createLifecycle };
  global.CwaLifecycle = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
