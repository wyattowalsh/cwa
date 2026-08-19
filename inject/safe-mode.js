/**
 * cwa safe mode — degrade chrome when critical selectors miss.
 * Export toolbar events remain available. No provider API fallback.
 */
(function (global) {
  "use strict";

  var DEFAULT_STRIKES = 3;

  function createSafeMode(options) {
    options = options || {};
    var strikesNeeded = options.strikes == null ? DEFAULT_STRIKES : options.strikes;
    var strikes = 0;
    var active  = false;
    var reason  = "";
    var onChange = options.onChange;

    function notify() {
      if (typeof onChange === "function") {
        onChange(snapshot());
      }
    }

    function snapshot() {
      return {
        active : active,
        strikes: strikes,
        reason : reason,
        code   : active ? "safe_mode" : "ok",
      };
    }

    function observe(probeResult) {
      var selectors = global.CwaSelectors;
      var misses;
      misses = selectors && typeof selectors.criticalMisses === "function"
        ? selectors.criticalMisses(probeResult)
        : [];
      if (active) {
        if (!misses.length) {
          active  = false;
          strikes = 0;
          reason  = "";
          notify();
        }
        return snapshot();
      }
      if (misses.length) {
        strikes += 1;
        reason = "critical_miss:" + misses.join(",");
        if (strikes >= strikesNeeded) {
          active = true;
          notify();
        }
      } else {
        strikes = 0;
        reason  = "";
      }
      return snapshot();
    }

    function enter(why) {
      active = true;
      reason = why || "manual";
      notify();
      return snapshot();
    }

    function reset() {
      active  = false;
      strikes = 0;
      reason  = "";
      notify();
      return snapshot();
    }

    return {
      observe : observe,
      enter   : enter,
      reset   : reset,
      snapshot: snapshot,
      isActive: function () { return active; },
    };
  }

  var api = { createSafeMode: createSafeMode, DEFAULT_STRIKES: DEFAULT_STRIKES };
  global.CwaSafeMode = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
