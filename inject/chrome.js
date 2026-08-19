/* cwa chrome — Pake page-world inject (document-start, SPA).
 * Toolbar, command palette, resizable sidebar, conversation minimap.
 * Export actions only dispatch events; export.js owns copy/md/zip. */
(function cwaChrome(global) {
  "use strict";

  var SIDEBAR_MIN     = 200;
  var SIDEBAR_MAX     = 420;
  var SIDEBAR_DEFAULT = 280;
  var SIDEBAR_COLLAPSE_MAX = 96;
  var SIDEBAR_STYLE_PROPERTIES = [
    "width",
    "min-width",
    "max-width",
    "flex-basis",
    "flex-shrink",
    "--sidebar-width",
    "position",
  ];
  var THEME_SENTINEL  = "cwa-theme-sentinel";
  var STYLE_ID        = "cwa-theme";
  var STORAGE_WIDTH   = "cwa.sidebarWidth";
  var NS              = "cwa";

  var EVENTS = {
    copy:    "cwa:copy",
    saveMd:  "cwa:save-md",
    saveZip: "cwa:save-zip",
  };

  var SIDEBAR_SELECTORS = [
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
  ];

  var MESSAGE_SELECTOR = "[data-message-author-role]";

  var PALETTE_COMMANDS = [
    { id: "copy",     title: "Copy visible thread",   hint: "Dispatches cwa:copy",     event: EVENTS.copy,    keywords: "clipboard markdown" },
    { id: "save-md",  title: "Save as Markdown",      hint: "Dispatches cwa:save-md",  event: EVENTS.saveMd,  keywords: "download md file" },
    { id: "save-zip", title: "Save zip (best effort)", hint: "Dispatches cwa:save-zip", event: EVENTS.saveZip, keywords: "archive export media" },
    { id: "diagnostics",  title: "Diagnostics snapshot",  hint: "Selector/lifecycle (redacted)", action: "diagnostics", keywords: "safe mode selectors" },
    { id: "composer", title: "Focus composer",        hint: "Jump to the prompt",          action: "composer",    keywords: "prompt textarea input" },
    { id: "latest",   title: "Jump to latest message", hint: "Scroll to last mounted turn", action: "latest",     keywords: "bottom end" },
    { id: "find",         title: "Find in page",          hint: "Use Cmd+F — Pake find",       action: "find",         keywords: "search" },
  ];

  var lifecycle   = null;
  var safeModeApi = null;
  var scheduler   = null;

  function allPaletteCommands() {
    var tools = global.CwaTools;
    var toolIds = ["copy-visible", "save-md", "save-zip", "diagnostics"];
    var localIds = { composer: true, latest: true, find: true };
    var catalog;
    var byId = {};
    var toolCommands = [];
    var localCommands = PALETTE_COMMANDS.filter(function (cmd) {
      return Boolean(localIds[cmd.id]);
    });
    var i;
    var item;

    if (!tools || typeof tools.catalog !== "function") {
      return PALETTE_COMMANDS.slice();
    }
    try {
      catalog = tools.catalog();
    } catch (_) {
      return PALETTE_COMMANDS.slice();
    }
    if (!Array.isArray(catalog)) {
      return PALETTE_COMMANDS.slice();
    }
    for (i = 0; i < catalog.length; i++) {
      item = catalog[i];
      if (item && toolIds.indexOf(item.id) !== -1) {
        byId[item.id] = item;
      }
    }
    for (i = 0; i < toolIds.length; i++) {
      item = byId[toolIds[i]];
      if (!item) {
        continue;
      }
      toolCommands.push({
        id      : item.id,
        title   : item.title,
        event   : item.event,
        action  : item.action,
        keywords: item.keywords,
      });
    }
    return toolCommands.concat(localCommands);
  }

  function isSafe() {
    return Boolean(safeModeApi && safeModeApi.isActive && safeModeApi.isActive());
  }

  function clampSidebarWidth(value, min, max, fallback) {
    var lo = min == null ? SIDEBAR_MIN : min;
    var hi = max == null ? SIDEBAR_MAX : max;
    var fb = fallback == null ? SIDEBAR_DEFAULT : fallback;
    var n  = typeof value === "number" ? value : parseFloat(value);
    if (!isFinite(n)) return fb;
    if (lo > hi) {
      var swap = lo;
      lo = hi;
      hi = swap;
    }
    var rounded = Math.round(n);
    if (rounded < lo) return lo;
    if (rounded > hi) return hi;
    return rounded;
  }

  function mapMinimapYToIndex(y, height, count) {
    var n = count | 0;
    if (n <= 0 || !(height > 0)) return -1;
    var t = y / height;
    if (t <= 0) return 0;
    if (t >= 1) return n - 1;
    return Math.min(n - 1, Math.max(0, Math.floor(t * n)));
  }

  function offsetToMinimapY(offset, contentHeight, minimapHeight) {
    if (!(contentHeight > 0) || !(minimapHeight > 0)) return 0;
    var y = (offset / contentHeight) * minimapHeight;
    if (y < 0) return 0;
    if (y > minimapHeight - 1) return minimapHeight - 1;
    return y;
  }

  function nearestOffsetIndex(offsets, target) {
    if (!offsets || !offsets.length) return -1;
    var best = 0;
    var bestDist = Infinity;
    for (var i = 0; i < offsets.length; i++) {
      var d = Math.abs(offsets[i] - target);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  function formatExportStatus(detail) {
    detail = detail || {};
    var code = detail.code || (detail.ok ? "ok" : "error");
    if (code === "ok" && detail.action === "copy") return "Copied visible thread";
    if (code === "ok" && detail.action === "save-md") return "Saved Markdown";
    if (code === "ok" && detail.action === "save-zip") return "Saved ZIP";
    if (code === "partial") return "Saved ZIP with media limitations";
    if (code === "duplicate") return "Export already in progress";
    if (code === "cancelled") return "Export cancelled";
    if (code === "jszip_missing") return "ZIP unavailable (JSZip missing)";
    if (code === "clipboard_denied") return "Clipboard permission denied";
    if (code === "download_denied") return "Download blocked";
    if (code === "unsupported_route") return "Nothing to export on this page";
    if (code === "safe_mode") return "Safe mode: chrome limited, export still available";
    if (code === "native_unavailable") return "Native companion unavailable; used browser download";
    return detail.message || code;
  }

  function isChromeOwnedNode(node) {
    var element = node && typeof node.closest === "function"
      ? node
      : node && node.parentElement;
    return Boolean(element && typeof element.closest === "function" &&
      element.closest("[data-cwa-chrome]"));
  }

  function shouldIgnoreMutations(records) {
    if (!records || !records.length) return false;
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (!record) return false;
      if (record.type !== "childList") {
        if (!isChromeOwnedNode(record.target)) return false;
        continue;
      }
      if (isChromeOwnedNode(record.target)) continue;
      var lists = [record.addedNodes || [], record.removedNodes || []];
      var sawElement = false;
      for (var j = 0; j < lists.length; j++) {
        for (var k = 0; k < lists[j].length; k++) {
          var node = lists[j][k];
          if (!node || node.nodeType !== 1) continue;
          sawElement = true;
          if (!isChromeOwnedNode(node)) return false;
        }
      }
      if (!sawElement) return false;
    }
    return true;
  }

  var COMPAT_JOB = "compat";

  function isCssHidden(el) {
    var node = el;
    var view;
    var style;
    var display;
    var visibility;
    var opacity;
    while (node && node.nodeType === 1) {
      if (node.hidden || (node.hasAttribute && node.hasAttribute("hidden"))) {
        return true;
      }
      view = node.ownerDocument && node.ownerDocument.defaultView;
      style = view && typeof view.getComputedStyle === "function"
        ? view.getComputedStyle(node)
        : node.style;
      display    = String((style && style.display) || "").toLowerCase();
      visibility = String((style && style.visibility) || "").toLowerCase();
      opacity    = String((style && style.opacity) || "").trim();
      if (display === "none" ||
          visibility === "hidden" ||
          visibility === "collapse" ||
          (opacity !== "" && Number(opacity) === 0)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function conversationMain(root) {
    var searchArea = root || document;
    var mains;
    var i;
    var node;
    var visible = [];
    var withThread = [];
    if (!searchArea || !searchArea.querySelectorAll) {
      return null;
    }
    mains = searchArea.querySelectorAll("main");
    for (i = 0; i < mains.length; i += 1) {
      node = mains[i];
      if (isCssHidden(node)) {
        continue;
      }
      visible.push(node);
      if (qs(messageSelector(), node) ||
          qs('article[data-testid^="conversation-turn-"]', node)) {
        withThread.push(node);
      }
    }
    if (withThread.length) {
      return withThread[0];
    }
    return visible[0] || null;
  }

  function isSettledConversationRoute(href) {
    var path;
    try {
      path = new URL(String(href || ""), "https://chatgpt.com").pathname;
    } catch (_err) {
      return false;
    }
    if (/\/c\/new\/?$/i.test(path)) {
      return false;
    }
    return /^\/c\/[A-Za-z0-9_-]+/.test(path);
  }

  function isSidebarCandidate(node) {
    if (!node || isChromeOwnedNode(node) ||
        typeof node.getBoundingClientRect !== "function") {
      return false;
    }
    var rect = node.getBoundingClientRect();
    return rect.height > 120 && rect.width > 40 && rect.left < 280;
  }

  function isTypingTarget(node) {
    if (!node) return false;
    var tag = (node.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (node.isContentEditable) return true;
    if (typeof node.closest !== "function") return false;
    return Boolean(node.closest(
      "[contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"
    ));
  }

  var api = {
    clampSidebarWidth: clampSidebarWidth,
    mapMinimapYToIndex: mapMinimapYToIndex,
    offsetToMinimapY: offsetToMinimapY,
    nearestOffsetIndex: nearestOffsetIndex,
    formatExportStatus: formatExportStatus,
    isChromeOwnedNode: isChromeOwnedNode,
    shouldIgnoreMutations: shouldIgnoreMutations,
    isSidebarCandidate: isSidebarCandidate,
    isTypingTarget: isTypingTarget,
    SIDEBAR_MIN: SIDEBAR_MIN,
    SIDEBAR_MAX: SIDEBAR_MAX,
    SIDEBAR_DEFAULT: SIDEBAR_DEFAULT,
    EVENTS: EVENTS,
    STORAGE_WIDTH: STORAGE_WIDTH,
    runtime: function runtime() {
      return {
        lifecycle: lifecycle && lifecycle.getState ? lifecycle.getState() : null,
        safeMode : safeModeApi && safeModeApi.snapshot ? safeModeApi.snapshot() : null,
      };
    },
  };

  global.CwaChrome = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  var isBrowser = typeof document !== "undefined" && typeof window !== "undefined";
  if (!isBrowser || global.__CWA_CHROME_BOOTED__) return;
  global.__CWA_CHROME_BOOTED__ = true;

  var themeSheet = null;
  var cachedThemeCss = "";
  var sidebarEl = null;
  var sidebarStyleSnapshot = null;
  var handleEl = null;
  var dragging = false;
  var dragStartX = 0;
  var dragStartW = 0;
  var minimapMessages = [];
  var minimapScroller = null;
  var paletteIndex = 0;
  var paletteFiltered = allPaletteCommands();
  var rafMinimap = 0;
  var rafSidebar = 0;
  var mutateTimer = 0;

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function scrollBehavior() {
    return prefersReducedMotion() ? "auto" : "smooth";
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function replaceKids(el, node) {
    if (!el) return;
    if (typeof el.replaceChildren === "function") {
      if (node == null) el.replaceChildren();
      else el.replaceChildren(node);
      return;
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    if (node) el.appendChild(node);
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var val = attrs[key];
        if (val == null || val === false) return;
        if (key === "className") node.className = val;
        else if (key === "tabIndex") node.tabIndex = val;
        else node.setAttribute(key, val === true ? "" : String(val));
      });
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function readStoredWidth() {
    try {
      return clampSidebarWidth(localStorage.getItem(STORAGE_WIDTH));
    } catch (_) {
      return SIDEBAR_DEFAULT;
    }
  }

  function writeStoredWidth(width) {
    try {
      localStorage.setItem(STORAGE_WIDTH, String(clampSidebarWidth(width)));
    } catch (_) {}
  }

  function emit(name) {
    var detail = { source: "chrome", at: Date.now() };
    var opts = { bubbles: true, cancelable: true, detail: detail };
    try {
      window.dispatchEvent(new CustomEvent(name, opts));
    } catch (_) {}
  }

  function styleContainsSentinel(node) {
    if (!node) return false;
    if (node.id === STYLE_ID || node.getAttribute("data-cwa-theme")) return true;
    var text = node.textContent || "";
    if (text.indexOf(THEME_SENTINEL) !== -1 || text.indexOf("--cwa-theme") !== -1) {
      return true;
    }
    if (node.sheet) {
      try {
        var rules = node.sheet.cssRules || [];
        for (var i = 0; i < rules.length; i++) {
          var css = rules[i].cssText || "";
          if (css.indexOf("--cwa-theme") !== -1) return true;
        }
      } catch (_) {}
    }
    return false;
  }

  function harvestThemeCss() {
    var nodes = qsa("style, link[rel='stylesheet']");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!styleContainsSentinel(node)) continue;
      node.id = STYLE_ID;
      node.setAttribute("data-cwa-theme", "1");
      var text = node.textContent || "";
      if (text.indexOf(THEME_SENTINEL) !== -1) {
        cachedThemeCss = text;
        return text;
      }
    }
    return cachedThemeCss;
  }

  function installAdopted(cssText) {
    if (!cssText) return false;
    try {
      if (typeof CSSStyleSheet === "undefined" || typeof CSSStyleSheet.prototype.replaceSync !== "function") {
        return false;
      }
      if (!themeSheet) themeSheet = new CSSStyleSheet();
      themeSheet.replaceSync(cssText);
      var list = document.adoptedStyleSheets ? Array.prototype.slice.call(document.adoptedStyleSheets) : [];
      if (list.indexOf(themeSheet) === -1) {
        document.adoptedStyleSheets = list.concat([themeSheet]);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function installStyleTag(cssText) {
    var host = document.head || document.documentElement;
    if (!host || !cssText) return;
    var node = document.getElementById(STYLE_ID);
    if (!node) {
      node = el("style", { id: STYLE_ID, "data-cwa-theme": "1" });
      host.appendChild(node);
    }
    if (node.textContent !== cssText) node.textContent = cssText;
  }

  function ensureThemeStylesheet() {
    var css = harvestThemeCss() || cachedThemeCss;
    if (!css) return;
    if (!installAdopted(css)) installStyleTag(css);
  }

  function isCollapsed(node) {
    if (!node || node.hidden) return true;
    if (node.getAttribute("aria-hidden") === "true") return true;
    var w = node.getBoundingClientRect().width;
    return w > 0 && w < SIDEBAR_COLLAPSE_MAX;
  }

  function sidebarSelectors() {
    var sel = global.CwaSelectors;
    if (sel && sel.SIDEBAR_SELECTORS && sel.SIDEBAR_SELECTORS.length) {
      return sel.SIDEBAR_SELECTORS;
    }
    return SIDEBAR_SELECTORS;
  }

  function messageSelector() {
    var sel = global.CwaSelectors;
    if (sel && sel.MESSAGE_SELECTOR) {
      return sel.MESSAGE_SELECTOR;
    }
    return MESSAGE_SELECTOR;
  }

  function findSidebar() {
    var selectors = global.CwaSelectors;
    var resolved;
    var seen = [];
    var list = sidebarSelectors();
    if (selectors && typeof selectors.resolve === "function") {
      resolved = selectors.resolve(document, "sidebar");
      if (resolved && isSidebarCandidate(resolved.node)) {
        return resolved.node;
      }
    }
    for (var i = 0; i < list.length; i++) {
      var found = qsa(list[i]);
      for (var j = 0; j < found.length; j++) {
        if (seen.indexOf(found[j]) === -1) seen.push(found[j]);
      }
    }
    var candidates = seen.filter(isSidebarCandidate);
    candidates.sort(function (a, b) {
      return b.getBoundingClientRect().height - a.getBoundingClientRect().height;
    });
    return candidates[0] || null;
  }

  function sidebarWidthApplied(node, px) {
    var style = node && node.style;
    var rootStyle = document.documentElement && document.documentElement.style;
    var important = ["width", "min-width", "max-width", "flex-basis", "flex-shrink"];
    var expected = [px, px, px, px, "0"];
    if (!style || !rootStyle) return false;
    for (var i = 0; i < important.length; i++) {
      if (style.getPropertyValue(important[i]) !== expected[i] ||
          style.getPropertyPriority(important[i]) !== "important") {
        return false;
      }
    }
    return style.getPropertyValue("--sidebar-width") === px &&
      rootStyle.getPropertyValue("--sidebar-width") === px;
  }

  function applySidebarWidth(node, width, force) {
    if (!node) return;
    if (!force && isCollapsed(node)) return;
    var px = clampSidebarWidth(width) + "px";
    if (!force && sidebarWidthApplied(node, px)) return;
    node.style.setProperty("width", px, "important");
    node.style.setProperty("min-width", px, "important");
    node.style.setProperty("max-width", px, "important");
    node.style.setProperty("flex-basis", px, "important");
    node.style.setProperty("flex-shrink", "0", "important");
    try {
      node.style.setProperty("--sidebar-width", px);
      document.documentElement.style.setProperty("--sidebar-width", px);
    } catch (_) {}
  }

  function ensureSidebarLandmark(node) {
    if (!node) return;
    if (node.tagName !== "NAV" && !node.getAttribute("role")) {
      node.setAttribute("role", "navigation");
    }
    if (!node.getAttribute("aria-label") && !node.getAttribute("aria-labelledby")) {
      node.setAttribute("aria-label", "Chat history");
    }
    var style = window.getComputedStyle(node);
    if (style.position === "static") node.style.position = "relative";
  }

  function onHandlePointerDown(event) {
    if (isSafe()) return;
    if (event.button != null && event.button !== 0) return;
    if (!sidebarEl) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartW = sidebarEl.getBoundingClientRect().width;
    handleEl.setAttribute("data-active", "true");
    try {
      handleEl.setPointerCapture(event.pointerId);
    } catch (_) {}
    event.preventDefault();
  }

  function onHandlePointerMove(event) {
    if (isSafe()) return;
    if (!dragging || !sidebarEl) return;
    var next = clampSidebarWidth(dragStartW + (event.clientX - dragStartX));
    applySidebarWidth(sidebarEl, next, true);
  }

  function onHandlePointerUp(event) {
    if (isSafe()) return;
    if (!dragging) return;
    dragging = false;
    if (handleEl) handleEl.removeAttribute("data-active");
    try {
      if (event && handleEl.hasPointerCapture(event.pointerId)) {
        handleEl.releasePointerCapture(event.pointerId);
      }
    } catch (_) {}
    if (sidebarEl) writeStoredWidth(sidebarEl.getBoundingClientRect().width);
  }

  function onHandleKeyDown(event) {
    if (isSafe()) return;
    if (!sidebarEl) return;
    var step = event.shiftKey ? 24 : 8;
    var current = sidebarEl.getBoundingClientRect().width;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applySidebarWidth(sidebarEl, current - step, true);
      writeStoredWidth(sidebarEl.getBoundingClientRect().width);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applySidebarWidth(sidebarEl, current + step, true);
      writeStoredWidth(sidebarEl.getBoundingClientRect().width);
    } else if (event.key === "Home") {
      event.preventDefault();
      applySidebarWidth(sidebarEl, SIDEBAR_MIN, true);
      writeStoredWidth(SIDEBAR_MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      applySidebarWidth(sidebarEl, SIDEBAR_MAX, true);
      writeStoredWidth(SIDEBAR_MAX);
    }
  }

  function mountHandle(node) {
    var existing = qs("." + NS + "-sidebar-handle", node);
    if (existing) {
      existing.setAttribute("data-cwa-chrome", "1");
      handleEl = existing;
      return;
    }
    handleEl = el("button", {
      type: "button",
      className: NS + "-sidebar-handle",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize sidebar",
      title: "Drag to resize sidebar",
      tabIndex: 0,
      "data-cwa-chrome": "1",
    });
    handleEl.addEventListener("pointerdown", onHandlePointerDown);
    handleEl.addEventListener("pointermove", onHandlePointerMove);
    handleEl.addEventListener("pointerup", onHandlePointerUp);
    handleEl.addEventListener("pointercancel", onHandlePointerUp);
    handleEl.addEventListener("keydown", onHandleKeyDown);
    node.appendChild(handleEl);
  }

  function captureSidebarStyles(node) {
    var styles = {};
    var rootStyle = document.documentElement && document.documentElement.style;
    var i;
    var name;
    if (!node || !node.style) {
      sidebarStyleSnapshot = null;
      return;
    }
    for (i = 0; i < SIDEBAR_STYLE_PROPERTIES.length; i++) {
      name = SIDEBAR_STYLE_PROPERTIES[i];
      styles[name] = {
        value   : node.style.getPropertyValue(name),
        priority: node.style.getPropertyPriority(name),
      };
    }
    sidebarStyleSnapshot = {
      node     : node,
      styles   : styles,
      rootValue: rootStyle ? rootStyle.getPropertyValue("--sidebar-width") : "",
      rootPriority: rootStyle ? rootStyle.getPropertyPriority("--sidebar-width") : "",
    };
  }

  function restoreStyleProperty(style, name, saved) {
    if (!style || !saved) return;
    if (saved.value) {
      style.setProperty(name, saved.value, saved.priority);
    } else {
      style.removeProperty(name);
    }
  }

  function clearSidebarStyles(node) {
    var snapshot = sidebarStyleSnapshot;
    var rootStyle = document.documentElement && document.documentElement.style;
    var i;
    var name;
    if (!node || !node.style || typeof node.style.removeProperty !== "function") {
      return;
    }
    if (snapshot && snapshot.node === node) {
      for (i = 0; i < SIDEBAR_STYLE_PROPERTIES.length; i++) {
        name = SIDEBAR_STYLE_PROPERTIES[i];
        restoreStyleProperty(node.style, name, snapshot.styles[name]);
      }
      restoreStyleProperty(rootStyle, "--sidebar-width", {
        value   : snapshot.rootValue,
        priority: snapshot.rootPriority,
      });
    } else {
      for (i = 0; i < SIDEBAR_STYLE_PROPERTIES.length - 1; i++) {
        node.style.removeProperty(SIDEBAR_STYLE_PROPERTIES[i]);
      }
      if (rootStyle) rootStyle.removeProperty("--sidebar-width");
    }
    sidebarStyleSnapshot = null;
  }

  function unmountHandle() {
    if (handleEl && handleEl.parentNode) {
      handleEl.parentNode.removeChild(handleEl);
    }
    handleEl = null;
  }

  function releaseSidebar(node) {
    dragging = false;
    unmountHandle();
    clearSidebarStyles(node);
  }

  function syncSidebar() {
    if (isSafe()) return;
    var node = findSidebar();
    if (!node) {
      if (sidebarEl) {
        releaseSidebar(sidebarEl);
        sidebarEl = null;
      }
      return;
    }
    if (sidebarEl !== node) {
      if (sidebarEl) releaseSidebar(sidebarEl);
      sidebarEl = node;
      captureSidebarStyles(node);
      ensureSidebarLandmark(node);
      mountHandle(node);
    } else {
      ensureSidebarLandmark(node);
      if (!handleEl || !node.contains(handleEl)) mountHandle(node);
    }
    var collapsed = isCollapsed(node);
    if (handleEl) {
      handleEl.disabled = false;
      if (collapsed) handleEl.setAttribute("hidden", "");
      else handleEl.removeAttribute("hidden");
    }
    if (!collapsed) applySidebarWidth(node, readStoredWidth(), false);
  }

  function findConversationScroller(fromEl) {
    var pane = conversationMain();
    var node = fromEl || (pane && qs(messageSelector(), pane));
    while (node && node !== document.body && node !== document.documentElement) {
      var style = window.getComputedStyle(node);
      var oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight + 8) {
        return node;
      }
      node = node.parentElement;
    }
    return pane || null;
  }

  function offsetTopRelative(node, ancestor) {
    var y = 0;
    var elNode = node;
    var reached = Boolean(!ancestor || node === ancestor);
    while (elNode && elNode !== ancestor) {
      y += elNode.offsetTop || 0;
      elNode = elNode.offsetParent;
      if (elNode && ancestor && ancestor.contains && !ancestor.contains(elNode) && ancestor !== elNode) {
        break;
      }
    }
    if (elNode === ancestor) {
      reached = true;
    }
    if (!reached || y === 0) {
      var nr = node.getBoundingClientRect();
      var ar = ancestor && ancestor.getBoundingClientRect ? ancestor.getBoundingClientRect() : { top: 0 };
      y = nr.top - ar.top + ((ancestor && ancestor.scrollTop) || 0);
    }
    return y;
  }

  function isThreadMessage(node) {
    var pane;
    if (!node) {
      return false;
    }
    pane = conversationMain();
    if (!pane || !pane.contains(node)) {
      return false;
    }
    if (node.closest && node.closest(
      "nav, [data-cwa-chrome], .cwa-toolbar, .cwa-palette, .cwa-minimap, .cwa-export-status"
    )) {
      return false;
    }
    return true;
  }

  function collectMessages() {
    var pane = conversationMain();
    var selectors = global.CwaSelectors;
    var resolved;
    var nodes;
    if (!pane) {
      return [];
    }
    if (selectors && typeof selectors.resolve === "function") {
      resolved = selectors.resolve(pane, "message");
      nodes = (resolved && resolved.nodes) || [];
    } else {
      nodes = qsa(messageSelector(), pane);
    }
    return nodes.filter(function (node) {
      return isThreadMessage(node) && node.getBoundingClientRect().height > 0;
    });
  }

  function rebuildMinimap() {
    if (isSafe()) return;
    var strip = document.getElementById(NS + "-minimap");
    if (!strip) return;
    var messages = collectMessages();
    minimapMessages = messages;
    var scroller = findConversationScroller(messages[0]);
    if (minimapScroller && minimapScroller !== scroller && minimapScroller.classList) {
      minimapScroller.classList.remove(NS + "-scroller");
    }
    minimapScroller = scroller;
    if (scroller && scroller.classList && !scroller.classList.contains(NS + "-scroller")) {
      scroller.classList.add(NS + "-scroller");
    }
    var height = strip.clientHeight || 1;
    var contentHeight = scroller && scroller.scrollHeight ? scroller.scrollHeight : height;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var tick = el("span", {
        className: NS + "-minimap-tick",
        "data-role": msg.getAttribute("data-message-author-role") || "",
        "aria-hidden": "true",
      });
      var y = offsetToMinimapY(offsetTopRelative(msg, scroller), contentHeight, height);
      tick.style.top = Math.round(y) + "px";
      frag.appendChild(tick);
    }
    replaceKids(strip, frag);
    strip.setAttribute("data-count", String(messages.length));
  }

  function scheduleMinimap() {
    if (isSafe()) return;
    if (scheduler) {
      scheduler.schedule("minimap", rebuildMinimap, { kind: "raf" });
      return;
    }
    if (rafMinimap) cancelAnimationFrame(rafMinimap);
    rafMinimap = requestAnimationFrame(function () {
      rafMinimap = 0;
      rebuildMinimap();
    });
  }

  function jumpToMessage(index) {
    var msg = minimapMessages[index];
    if (!msg) return;
    msg.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }

  function onMinimapClick(event) {
    var strip = event.currentTarget;
    var rect = strip.getBoundingClientRect();
    var scroller = minimapScroller || findConversationScroller();
    var y = event.clientY - rect.top;
    var idx;
    if (minimapMessages.length && scroller) {
      var target = (y / Math.max(rect.height, 1)) * (scroller.scrollHeight || 1);
      var offsets = minimapMessages.map(function (m) {
        return offsetTopRelative(m, scroller);
      });
      idx = nearestOffsetIndex(offsets, target);
    } else {
      idx = mapMinimapYToIndex(y, rect.height, minimapMessages.length);
    }
    jumpToMessage(idx);
  }

  function onMinimapKeyDown(event) {
    if (!minimapMessages.length) return;
    var current = Number(event.currentTarget.getAttribute("data-active-index") || "0");
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      current = Math.min(minimapMessages.length - 1, current + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      current = Math.max(0, current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      current = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      current = minimapMessages.length - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
    } else {
      return;
    }
    event.currentTarget.setAttribute("data-active-index", String(current));
    jumpToMessage(current);
  }

  function mountMinimap() {
    var strip = document.getElementById(NS + "-minimap");
    if (!strip) {
      strip = el("div", {
        id: NS + "-minimap",
        className: NS + "-minimap",
        role: "navigation",
        "aria-label": "Conversation minimap",
        title: "Jump to a mounted message",
        tabIndex: 0,
        "data-cwa-chrome": "1",
      });
      strip.addEventListener("click", onMinimapClick);
      strip.addEventListener("keydown", onMinimapKeyDown);
      (document.body || document.documentElement).appendChild(strip);
    } else if (!strip.isConnected) {
      (document.body || document.documentElement).appendChild(strip);
    }
    strip.setAttribute("data-cwa-chrome", "1");
    scheduleMinimap();
  }

  function unmountMinimap() {
    var strip = document.getElementById(NS + "-minimap");
    if (strip && strip.parentNode) strip.parentNode.removeChild(strip);
    if (minimapScroller && minimapScroller.classList) {
      minimapScroller.classList.remove(NS + "-scroller");
    }
    minimapMessages = [];
    minimapScroller = null;
    if (scheduler && typeof scheduler.cancel === "function") {
      scheduler.cancel("minimap");
    }
    if (rafMinimap) {
      cancelAnimationFrame(rafMinimap);
      rafMinimap = 0;
    }
  }

  function focusComposer() {
    var selectors = global.CwaSelectors;
    var resolved;
    if (selectors && typeof selectors.resolve === "function") {
      resolved = selectors.resolve(document, "composer");
      if (resolved && resolved.node) {
        if (typeof resolved.node.focus === "function") resolved.node.focus();
        return;
      }
    }
    var node =
      qs("#prompt-textarea") ||
      qs("[data-testid*='composer' i] textarea") ||
      qs("[data-testid*='composer' i] [contenteditable='true']") ||
      qs("form textarea") ||
      qs("main [contenteditable='true']");
    if (node && typeof node.focus === "function") node.focus();
  }

  function jumpLatest() {
    var messages = collectMessages();
    var last = messages[messages.length - 1];
    if (last) last.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
  }

  function closePalette() {
    var backdrop = document.getElementById(NS + "-palette-backdrop");
    var dialog = document.getElementById(NS + "-palette");
    var input = document.getElementById(NS + "-palette-input");
    if (backdrop) backdrop.hidden = true;
    if (dialog) {
      dialog.hidden = true;
      dialog.setAttribute("aria-hidden", "true");
    }
    if (input) input.setAttribute("aria-expanded", "false");
    var trigger = qs("." + NS + "-toolbar [data-cwa-action='palette']");
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  }

  function renderPaletteList(query) {
    var q = (query || "").trim().toLowerCase();
    paletteFiltered = allPaletteCommands().filter(function (cmd) {
      if (!q) return true;
      return (cmd.title + " " + (cmd.hint || "") + " " + (cmd.keywords || "")).toLowerCase().indexOf(q) !== -1;
    });
    paletteIndex = 0;
    var list = document.getElementById(NS + "-palette-list");
    if (!list) return;
    var frag = document.createDocumentFragment();
    paletteFiltered.forEach(function (cmd, i) {
      var item = el("button", {
        type: "button",
        className: NS + "-palette-item",
        role: "option",
        id: NS + "-opt-" + cmd.id,
        "data-id": cmd.id,
        "aria-selected": i === 0 ? "true" : "false",
      });
      item.textContent = cmd.title + (cmd.hint ? " — " + cmd.hint : "");
      item.addEventListener("click", function () {
        runCommand(cmd);
      });
      frag.appendChild(item);
    });
    replaceKids(list, frag);
    var input = document.getElementById(NS + "-palette-input");
    if (input) {
      input.setAttribute("aria-activedescendant", paletteFiltered[0] ? NS + "-opt-" + paletteFiltered[0].id : "");
    }
  }

  function highlightPalette() {
    var items = qsa("." + NS + "-palette-item");
    items.forEach(function (item, i) {
      item.setAttribute("aria-selected", i === paletteIndex ? "true" : "false");
    });
    var input = document.getElementById(NS + "-palette-input");
    var active = paletteFiltered[paletteIndex];
    if (input) input.setAttribute("aria-activedescendant", active ? NS + "-opt-" + active.id : "");
    if (items[paletteIndex] && items[paletteIndex].scrollIntoView) {
      items[paletteIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function emitDiagnostics() {
    var tools = global.CwaTools;
    var diag  = global.CwaDiagnostics;
    var sel   = global.CwaSelectors;
    var probe = sel && typeof sel.probe === "function" ? sel.probe(document) : {};
    var snap;
    if (tools && typeof tools.run === "function") {
      return tools.run("diagnostics", {
        window    : window,
        probe     : probe,
        lifecycle : lifecycle,
        safeMode  : safeModeApi,
        href      : window.location && window.location.href,
      });
    }
    if (diag && typeof diag.snapshot === "function") {
      snap = diag.snapshot({
        probe     : probe,
        lifecycle : lifecycle,
        safeMode  : safeModeApi,
        href      : window.location && window.location.href,
      });
      diag.emit({ window: window }, snap);
      return snap;
    }
    return null;
  }

  function runCommand(cmd) {
    var tools;
    var selectors;
    var probe;
    closePalette();
    if (!cmd) return;
    tools = global.CwaTools;
    if (tools && typeof tools.find === "function" && typeof tools.run === "function" && tools.find(cmd.id)) {
      selectors = global.CwaSelectors;
      probe = selectors && typeof selectors.probe === "function" ? selectors.probe(document) : {};
      return tools.run(cmd.id, {
        window   : window,
        probe    : probe,
        lifecycle: lifecycle,
        safeMode : safeModeApi,
        href     : location.href,
      });
    }
    if (cmd.event) emit(cmd.event);
    if (cmd.action === "composer") focusComposer();
    if (cmd.action === "latest") jumpLatest();
    if (cmd.action === "diagnostics") emitDiagnostics();
  }

  function openPalette() {
    mountPalette();
    var backdrop = document.getElementById(NS + "-palette-backdrop");
    var dialog = document.getElementById(NS + "-palette");
    var input = document.getElementById(NS + "-palette-input");
    if (backdrop) backdrop.hidden = false;
    if (dialog) {
      dialog.hidden = false;
      dialog.setAttribute("aria-hidden", "false");
    }
    var trigger = qs("." + NS + "-toolbar [data-cwa-action='palette']");
    if (trigger) trigger.setAttribute("aria-expanded", "true");
    renderPaletteList("");
    if (input) {
      input.value = "";
      input.setAttribute("aria-expanded", "true");
      input.focus();
    }
  }

  function togglePalette() {
    var dialog = document.getElementById(NS + "-palette");
    if (dialog && !dialog.hidden) closePalette();
    else openPalette();
  }

  function onPaletteKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!paletteFiltered.length) return;
      paletteIndex = (paletteIndex + 1) % paletteFiltered.length;
      highlightPalette();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!paletteFiltered.length) return;
      paletteIndex = (paletteIndex - 1 + paletteFiltered.length) % paletteFiltered.length;
      highlightPalette();
    } else if (event.key === "Enter") {
      event.preventDefault();
      runCommand(paletteFiltered[paletteIndex]);
    } else if (event.key === "Tab") {
      var dialog = document.getElementById(NS + "-palette");
      if (!dialog || dialog.hidden) return;
      var focusable = qsa("button, input", dialog);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function mountPalette() {
    var existingBackdrop = document.getElementById(NS + "-palette-backdrop");
    if (!existingBackdrop) {
      var backdrop = el("div", {
        id: NS + "-palette-backdrop",
        className: NS + "-palette-backdrop",
        "data-cwa-chrome": "1",
      });
      backdrop.hidden = true;
      backdrop.addEventListener("click", closePalette);
      (document.body || document.documentElement).appendChild(backdrop);
    } else {
      existingBackdrop.setAttribute("data-cwa-chrome", "1");
    }
    var existingDialog = document.getElementById(NS + "-palette");
    if (existingDialog) {
      existingDialog.setAttribute("data-cwa-chrome", "1");
      return;
    }
    var dialog = el("div", {
      id: NS + "-palette",
      className: NS + "-palette",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": NS + "-palette-title",
      "data-cwa-chrome": "1",
    });
    dialog.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
    var title = el("h2", { id: NS + "-palette-title", className: "visually-hidden" }, "cwa commands");
    title.style.position = "absolute";
    title.style.width = "1px";
    title.style.height = "1px";
    title.style.overflow = "hidden";
    title.style.clip = "rect(0 0 0 0)";
    var input = el("input", {
      id: NS + "-palette-input",
      className: NS + "-palette-input",
      type: "search",
      role: "combobox",
      "aria-label": "Filter commands",
      "aria-controls": NS + "-palette-list",
      "aria-autocomplete": "list",
      "aria-expanded": "false",
      "aria-activedescendant": "",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "Filter commands",
    });
    input.addEventListener("input", function () {
      renderPaletteList(input.value);
    });
    var list = el("div", {
      id: NS + "-palette-list",
      className: NS + "-palette-list",
      role: "listbox",
      "aria-label": "Commands",
    });
    var hint = el("p", { className: NS + "-palette-hint" }, "Cmd+Shift+K toggles this palette. Cmd+F is Pake find.");
    dialog.appendChild(title);
    dialog.appendChild(input);
    dialog.appendChild(list);
    dialog.appendChild(hint);
    dialog.addEventListener("keydown", onPaletteKeyDown);
    (document.body || document.documentElement).appendChild(dialog);
  }

  function mountExportStatus() {
    var node = document.getElementById(NS + "-export-status");
    if (!node) {
      node = el("div", {
        id: NS + "-export-status",
        className: NS + "-export-status",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
        "data-cwa-chrome": "1",
      });
      node.hidden = true;
      (document.body || document.documentElement).appendChild(node);
    } else if (!node.isConnected) {
      (document.body || document.documentElement).appendChild(node);
    }
    node.setAttribute("data-cwa-chrome", "1");
    return node;
  }

  function onExportStatus(event) {
    if (event.target && event.target !== window) return;
    var node = mountExportStatus();
    var detail = (event && event.detail) || {};
    var text = formatExportStatus(detail);
    if (!text) {
      node.hidden = true;
      node.textContent = "";
      return;
    }
    node.setAttribute("data-ok", detail.ok ? "true" : "false");
    node.setAttribute("data-code", detail.code || "");
    node.hidden = false;
    node.textContent = text;
  }

  function mountToolbar() {
    var bar = document.getElementById(NS + "-toolbar");
    if (bar && bar.isConnected) {
      bar.setAttribute("data-cwa-chrome", "1");
      return bar;
    }
    if (!bar) {
      bar = el("div", {
        id: NS + "-toolbar",
        className: NS + "-toolbar",
        role: "toolbar",
        "aria-label": "cwa thread actions",
        "data-cwa-chrome": "1",
      });
      var buttons = [
        { action: "copy", label: "Copy visible thread", event: EVENTS.copy, text: "Copy" },
        { action: "save-md", label: "Save visible thread as Markdown", event: EVENTS.saveMd, text: "MD" },
        { action: "save-zip", label: "Save zip of visible thread", event: EVENTS.saveZip, text: "ZIP" },
        { action: "palette", label: "Open command palette", text: "Cmd" },
      ];
      buttons.forEach(function (spec) {
        var btn = el("button", {
          type: "button",
          "data-cwa-action": spec.action,
          "aria-label": spec.label,
          title: spec.label,
        }, spec.text);
        if (spec.action === "palette") {
          btn.setAttribute("aria-haspopup", "dialog");
          btn.setAttribute("aria-expanded", "false");
          btn.setAttribute("aria-controls", NS + "-palette");
        }
        btn.addEventListener("click", function () {
          if (spec.event) emit(spec.event);
          if (spec.action === "palette") togglePalette();
        });
        bar.appendChild(btn);
      });
    }
    bar.setAttribute("data-cwa-chrome", "1");
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }

  function onGlobalKeyDown(event) {
    var key = event.key;
    if (key === "Escape") {
      var dialog = document.getElementById(NS + "-palette");
      if (dialog && !dialog.hidden) {
        event.preventDefault();
        closePalette();
      }
      return;
    }
    if (isTypingTarget(event.target)) return;
    var mod = event.metaKey || event.ctrlKey;
    if (!mod || !event.shiftKey) return;
    if (key === "f" || key === "F") return;
    if (key === "k" || key === "K") {
      event.preventDefault();
      event.stopPropagation();
      togglePalette();
      return;
    }
    if (key === "c" || key === "C") {
      event.preventDefault();
      event.stopPropagation();
      emit(EVENTS.copy);
      return;
    }
    if (key === "s" || key === "S") {
      event.preventDefault();
      event.stopPropagation();
      emit(EVENTS.saveMd);
    }
  }

  function hookHistory(onNavigate) {
    if (global.__CWA_HISTORY_HOOKED__) return;
    global.__CWA_HISTORY_HOOKED__ = true;
    function wrap(method) {
      var orig = history[method];
      if (typeof orig !== "function") return;
      history[method] = function () {
        var ret = orig.apply(this, arguments);
        try {
          onNavigate();
        } catch (_) {}
        return ret;
      };
    }
    wrap("pushState");
    wrap("replaceState");
    window.addEventListener("popstate", onNavigate);
    window.addEventListener("hashchange", onNavigate);
  }

  function overlayThreadProbe(sel, probe, pane) {
    var names = ["message", "thinking", "citation", "fileCard"];
    var i;
    var resolved;
    if (!pane || !probe || !sel || typeof sel.resolve !== "function") {
      return probe;
    }
    for (i = 0; i < names.length; i += 1) {
      resolved = sel.resolve(pane, names[i]);
      probe[names[i]] = {
        hit     : resolved.hit,
        selector: resolved.selector,
        count   : resolved.count,
        critical: resolved.critical,
      };
    }
    return probe;
  }

  function refreshCompatibility() {
    var sel = global.CwaSelectors;
    var probe;
    var state;
    if (lifecycle && window.location) {
      lifecycle.noteHref(window.location.href);
    }
    if (sel && typeof sel.probe === "function") {
      probe = overlayThreadProbe(sel, sel.probe(document), conversationMain());
      if (
        safeModeApi &&
        typeof safeModeApi.observe === "function" &&
        isSettledConversationRoute(window.location && window.location.href)
      ) {
        safeModeApi.observe(probe);
      }
      if (probe.sidebar && lifecycle && typeof lifecycle.getState === "function") {
        state = lifecycle.getState();
        if (!probe.sidebar.hit && state !== "safe" && typeof lifecycle.degrade === "function") {
          lifecycle.degrade("sidebar_miss");
        } else if (probe.sidebar.hit && state === "degraded" && typeof lifecycle.recover === "function") {
          lifecycle.recover();
        }
      }
    }
  }

  function onSpaNavigate() {
    refreshCompatibility();
    ensureThemeStylesheet();
    mountToolbar();
    mountPalette();
    mountExportStatus();
    if (!isSafe()) {
      mountMinimap();
      syncSidebar();
      scheduleMinimap();
    }
  }

  function scheduleCompatRefresh() {
    if (scheduler) {
      scheduler.schedule(COMPAT_JOB, onSpaNavigate, { kind: "timeout", delay: 80 });
      return;
    }
    if (mutateTimer) clearTimeout(mutateTimer);
    mutateTimer = setTimeout(function () {
      mutateTimer = 0;
      onSpaNavigate();
    }, 80);
  }

  function onMutations(records) {
    if (shouldIgnoreMutations(records)) return;
    scheduleCompatRefresh();
  }

  function bindObservers() {
    var root = document.documentElement;
    if (!root || global.__CWA_OBSERVER__) return;
    global.__CWA_OBSERVER__ = true;
    var obs = new MutationObserver(onMutations);
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
    window.addEventListener("resize", scheduleMinimap);
    if (typeof ResizeObserver === "function") {
      try {
        var ro = new ResizeObserver(function () {
          scheduleMinimap();
          if (scheduler) {
            scheduler.schedule("sidebar-resize", syncSidebar, { kind: "raf" });
            return;
          }
          if (!rafSidebar) {
            rafSidebar = requestAnimationFrame(function () {
              rafSidebar = 0;
              syncSidebar();
            });
          }
        });
        ro.observe(root);
      } catch (_) {}
    }
  }

  function ensureRuntime() {
    if (!scheduler && global.CwaScheduler && typeof global.CwaScheduler.createScheduler === "function") {
      scheduler = global.CwaScheduler.createScheduler();
    }
    if (!lifecycle && global.CwaLifecycle && typeof global.CwaLifecycle.createLifecycle === "function") {
      lifecycle = global.CwaLifecycle.createLifecycle({
        href: window.location && window.location.href,
      });
      lifecycle.boot();
    }
    if (!safeModeApi && global.CwaSafeMode && typeof global.CwaSafeMode.createSafeMode === "function") {
      safeModeApi = global.CwaSafeMode.createSafeMode({
        onChange: function (snap) {
          if (snap.active) {
            if (lifecycle && typeof lifecycle.enterSafe === "function") {
              lifecycle.enterSafe(snap.reason);
            }
            if (scheduler && typeof scheduler.cancel === "function") {
              scheduler.cancel("sidebar-resize");
              scheduler.cancel(COMPAT_JOB);
            }
            unmountMinimap();
            if (sidebarEl) {
              releaseSidebar(sidebarEl);
              sidebarEl = null;
            }
            if (rafSidebar) {
              cancelAnimationFrame(rafSidebar);
              rafSidebar = 0;
            }
            dragging = false;
            emitStatusSafe(snap);
          }
        },
      });
    }
  }

  function emitStatusSafe(snap) {
    try {
      window.dispatchEvent(new CustomEvent("cwa:export-status", {
        bubbles: true,
        detail : {
          action : "chrome",
          ok     : true,
          code   : "safe_mode",
          message: snap.reason || "safe_mode",
        },
      }));
    } catch (_) {}
  }

  function boot() {
    ensureRuntime();
    ensureThemeStylesheet();
    var host = document.body || document.documentElement;
    if (!host) {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
      return;
    }
    mountToolbar();
    mountPalette();
    mountExportStatus();
    refreshCompatibility();
    if (!isSafe()) {
      mountMinimap();
      syncSidebar();
    }
    bindObservers();
    hookHistory(scheduleCompatRefresh);
    window.addEventListener("keydown", onGlobalKeyDown, true);
    window.addEventListener("cwa:export-status", onExportStatus);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) scheduleCompatRefresh();
    });
  }

  if (document.readyState === "loading" && !document.body) {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
    ensureThemeStylesheet();
    hookHistory(scheduleCompatRefresh);
    window.addEventListener("keydown", onGlobalKeyDown, true);
  } else {
    boot();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
