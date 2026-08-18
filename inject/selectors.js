/**
 * cwa selector registry — page-world, untrusted ChatGPT DOM.
 *
 * Role / landmark / data-testid fallbacks only. Never hashed Tailwind
 * class selectors. Probe results must not include message text.
 */
(function (global) {
  "use strict";

  var CLASS_ONLY_RE = /^(?:\.[A-Za-z_-][\w-]*)+$/;

  var TARGETS = {
    sidebar: {
      critical : false,
      selectors: [
        "nav[aria-label*='Chat' i]",
        "nav[aria-label*='sidebar' i]",
        "nav[aria-label*='history' i]",
        "nav[aria-label*='conversation' i]",
        "[data-testid='left-sidebar']",
        "[data-testid='sidebar']",
        "#stage-slideover-sidebar",
        "aside nav",
        "aside",
        "nav",
      ],
    },
    message: {
      critical : true,
      selectors: [
        "[data-message-author-role]",
        'article[data-testid^="conversation-turn-"]',
      ],
    },
    composer: {
      critical : false,
      selectors: [
        "#prompt-textarea",
        "[data-testid*='composer' i] textarea",
        "[data-testid*='composer' i] [contenteditable='true']",
        "form textarea",
        "main [contenteditable='true']",
      ],
    },
    thinking: {
      critical : false,
      selectors: [
        '[data-testid="reasoning"]',
        '[data-testid="thinking"]',
        '[data-cwa="thinking"]',
      ],
    },
    citation: {
      critical : false,
      selectors: [
        '[data-testid*="citation"]',
        '[data-testid*="footnote"]',
        "[data-cite]",
        'a[href*="cite"]',
      ],
    },
    fileCard: {
      critical : false,
      selectors: [
        "a[download]",
        "a[href*='/files/']",
        "[data-testid*='file-card']",
        "[data-testid*='attachment']",
      ],
    },
  };

  function isUnsafeSelector(selector) {
    var sel = String(selector || "").trim();
    if (!sel) {
      return true;
    }
    if (CLASS_ONLY_RE.test(sel)) {
      return true;
    }
    return false;
  }

  function safeSelectors(list) {
    var out = [];
    var i;
    for (i = 0; i < (list || []).length; i += 1) {
      if (!isUnsafeSelector(list[i])) {
        out.push(list[i]);
      }
    }
    return out;
  }

  function queryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return [];
    }
    try {
      return Array.prototype.slice.call(root.querySelectorAll(selector));
    } catch (err) {
      return [];
    }
  }

  function resolve(root, name) {
    var target = TARGETS[name];
    var list;
    var i;
    var nodes;
    if (!target) {
      return { name: name, hit: false, selector: null, count: 0, node: null, critical: false };
    }
    list = safeSelectors(target.selectors);
    for (i = 0; i < list.length; i += 1) {
      nodes = queryAll(root, list[i]);
      if (nodes.length) {
        return {
          name     : name,
          hit      : true,
          selector : list[i],
          count    : nodes.length,
          node     : nodes[0],
          nodes    : nodes,
          critical : Boolean(target.critical),
        };
      }
    }
    return {
      name    : name,
      hit     : false,
      selector: null,
      count   : 0,
      node    : null,
      nodes   : [],
      critical: Boolean(target.critical),
    };
  }

  function probe(root) {
    var names = Object.keys(TARGETS);
    var out   = {};
    var i;
    var result;
    for (i = 0; i < names.length; i += 1) {
      result = resolve(root, names[i]);
      out[names[i]] = {
        hit     : result.hit,
        selector: result.selector,
        count   : result.count,
        critical: result.critical,
      };
    }
    return out;
  }

  function criticalMisses(snapshot) {
    var names = Object.keys(snapshot || {});
    var missed = [];
    var i;
    var row;
    for (i = 0; i < names.length; i += 1) {
      row = snapshot[names[i]];
      if (row && row.critical && !row.hit) {
        missed.push(names[i]);
      }
    }
    return missed;
  }

  var api = {
    TARGETS          : TARGETS,
    isUnsafeSelector : isUnsafeSelector,
    safeSelectors    : safeSelectors,
    resolve          : resolve,
    probe            : probe,
    criticalMisses   : criticalMisses,
    MESSAGE_SELECTOR : TARGETS.message.selectors[0],
    SIDEBAR_SELECTORS: TARGETS.sidebar.selectors.slice(),
  };

  global.CwaSelectors = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
