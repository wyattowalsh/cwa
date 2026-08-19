/**
 * cwa scheduler — coalesce rAF and timeout jobs by id.
 */
(function (global) {
  "use strict";

  function createScheduler(deps) {
    deps = deps || {};
    var raf = deps.raf || (typeof requestAnimationFrame === "function"
      ? requestAnimationFrame.bind(global)
      : function (fn) { return setTimeout(fn, 16); });
    var caf = deps.caf || (typeof cancelAnimationFrame === "function"
      ? cancelAnimationFrame.bind(global)
      : clearTimeout);
    var setT = deps.setTimeout || setTimeout;
    var clearT = deps.clearTimeout || clearTimeout;
    var jobs = Object.create(null);

    function cancel(id) {
      var job = jobs[id];
      if (!job) {
        return false;
      }
      if (job.kind === "raf") {
        caf(job.handle);
      } else {
        clearT(job.handle);
      }
      delete jobs[id];
      return true;
    }

    function schedule(id, fn, options) {
      options = options || {};
      var delay = options.delay == null ? 0 : options.delay;
      var kind  = options.kind || (delay > 0 ? "timeout" : "raf");
      cancel(id);
      if (kind === "timeout") {
        jobs[id] = {
          kind  : "timeout",
          handle: setT(function () {
            delete jobs[id];
            fn();
          }, delay),
        };
      } else {
        jobs[id] = {
          kind  : "raf",
          handle: raf(function () {
            delete jobs[id];
            fn();
          }),
        };
      }
      return id;
    }

    function pending(id) {
      if (id) {
        return Boolean(jobs[id]);
      }
      return Object.keys(jobs);
    }

    function flush() {
      var ids = Object.keys(jobs);
      var i;
      for (i = 0; i < ids.length; i += 1) {
        cancel(ids[i]);
      }
    }

    return {
      schedule: schedule,
      cancel  : cancel,
      pending : pending,
      flush   : flush,
    };
  }

  var api = { createScheduler: createScheduler };
  global.CwaScheduler = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
