/* cwa chrome — Pake page-world inject (document-start, SPA).
 * Toolbar, command palette, resizable sidebar, conversation minimap.
 * Export actions only dispatch events; export.js owns copy/md/zip. */
(function cwaChrome(global) {
  "use strict";

  var SIDEBAR_MIN     = 200;
  var SIDEBAR_MAX     = 420;
  var SIDEBAR_DEFAULT = 280;
  var SIDEBAR_COLLAPSE_MAX = 96;
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
    { id: "composer", title: "Focus composer",        hint: "Jump to the prompt",          action: "composer",    keywords: "prompt textarea input" },
    { id: "latest",   title: "Jump to latest message", hint: "Scroll to last mounted turn", action: "latest",     keywords: "bottom end" },
    { id: "find",     title: "Find in page",          hint: "Use Cmd+F — Pake find",       action: "find",        keywords: "search" },
  ];

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

  var api = {
    clampSidebarWidth: clampSidebarWidth,
    mapMinimapYToIndex: mapMinimapYToIndex,
    offsetToMinimapY: offsetToMinimapY,
    nearestOffsetIndex: nearestOffsetIndex,
    SIDEBAR_MIN: SIDEBAR_MIN,
    SIDEBAR_MAX: SIDEBAR_MAX,
    SIDEBAR_DEFAULT: SIDEBAR_DEFAULT,
    EVENTS: EVENTS,
    STORAGE_WIDTH: STORAGE_WIDTH,
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
  var handleEl = null;
  var dragging = false;
  var dragStartX = 0;
  var dragStartW = 0;
  var minimapMessages = [];
  var minimapScroller = null;
  var paletteIndex = 0;
  var paletteFiltered = PALETTE_COMMANDS.slice();
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
      document.dispatchEvent(new CustomEvent(name, opts));
    } catch (_) {}
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

  function findSidebar() {
    var seen = [];
    for (var i = 0; i < SIDEBAR_SELECTORS.length; i++) {
      var found = qsa(SIDEBAR_SELECTORS[i]);
      for (var j = 0; j < found.length; j++) {
        if (seen.indexOf(found[j]) === -1) seen.push(found[j]);
      }
    }
    var candidates = seen.filter(function (node) {
      if (node.closest && node.closest("#" + NS + "-palette, ." + NS + "-toolbar, ." + NS + "-minimap")) {
        return false;
      }
      var r = node.getBoundingClientRect();
      return r.height > 120 && r.width > 40 && r.left < 280;
    });
    candidates.sort(function (a, b) {
      return b.getBoundingClientRect().height - a.getBoundingClientRect().height;
    });
    return candidates[0] || null;
  }

  function applySidebarWidth(node, width, force) {
    if (!node) return;
    if (!force && isCollapsed(node)) return;
    var px = clampSidebarWidth(width) + "px";
    if (!force && node.style.width === px) return;
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
    if (!dragging || !sidebarEl) return;
    var next = clampSidebarWidth(dragStartW + (event.clientX - dragStartX));
    applySidebarWidth(sidebarEl, next, true);
  }

  function onHandlePointerUp(event) {
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
    });
    handleEl.addEventListener("pointerdown", onHandlePointerDown);
    handleEl.addEventListener("pointermove", onHandlePointerMove);
    handleEl.addEventListener("pointerup", onHandlePointerUp);
    handleEl.addEventListener("pointercancel", onHandlePointerUp);
    handleEl.addEventListener("keydown", onHandleKeyDown);
    node.appendChild(handleEl);
  }

  function syncSidebar() {
    var node = findSidebar();
    if (!node) return;
    if (sidebarEl !== node) {
      sidebarEl = node;
      ensureSidebarLandmark(node);
      mountHandle(node);
    } else {
      ensureSidebarLandmark(node);
      if (!handleEl || !node.contains(handleEl)) mountHandle(node);
    }
    var collapsed = isCollapsed(node);
    if (handleEl) {
      if (collapsed) handleEl.setAttribute("hidden", "");
      else handleEl.removeAttribute("hidden");
    }
    if (!collapsed) applySidebarWidth(node, readStoredWidth(), false);
  }

  function findConversationScroller(fromEl) {
    var node = fromEl || qs(MESSAGE_SELECTOR);
    while (node && node !== document.body && node !== document.documentElement) {
      var style = window.getComputedStyle(node);
      var oy = style.overflowY;
      if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight + 8) {
        return node;
      }
      node = node.parentElement;
    }
    return qs("main") || document.scrollingElement || document.documentElement;
  }

  function offsetTopRelative(node, ancestor) {
    var y = 0;
    var elNode = node;
    while (elNode && elNode !== ancestor) {
      y += elNode.offsetTop || 0;
      elNode = elNode.offsetParent;
      if (elNode && ancestor.contains && !ancestor.contains(elNode) && ancestor !== elNode) {
        break;
      }
    }
    if (y === 0) {
      var nr = node.getBoundingClientRect();
      var ar = ancestor.getBoundingClientRect ? ancestor.getBoundingClientRect() : { top: 0 };
      y = nr.top - ar.top + (ancestor.scrollTop || 0);
    }
    return y;
  }

  function collectMessages() {
    return qsa(MESSAGE_SELECTOR).filter(function (node) {
      return node.getBoundingClientRect().height > 0;
    });
  }

  function rebuildMinimap() {
    var strip = document.getElementById(NS + "-minimap");
    if (!strip) return;
    var messages = collectMessages();
    minimapMessages = messages;
    var scroller = findConversationScroller(messages[0]);
    minimapScroller = scroller;
    if (scroller && scroller.classList) scroller.classList.add(NS + "-scroller");
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
      });
      strip.addEventListener("click", onMinimapClick);
      strip.addEventListener("keydown", onMinimapKeyDown);
      (document.body || document.documentElement).appendChild(strip);
    } else if (!strip.isConnected) {
      (document.body || document.documentElement).appendChild(strip);
    }
    scheduleMinimap();
  }

  function focusComposer() {
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
    if (backdrop) backdrop.hidden = true;
    if (dialog) {
      dialog.hidden = true;
      dialog.setAttribute("aria-hidden", "true");
    }
    var trigger = qs("." + NS + "-toolbar [data-cwa-action='palette']");
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  }

  function renderPaletteList(query) {
    var q = (query || "").trim().toLowerCase();
    paletteFiltered = PALETTE_COMMANDS.filter(function (cmd) {
      if (!q) return true;
      return (cmd.title + " " + cmd.hint + " " + (cmd.keywords || "")).toLowerCase().indexOf(q) !== -1;
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
      item.textContent = cmd.title + " — " + cmd.hint;
      item.addEventListener("click", function () {
        runCommand(cmd);
      });
      frag.appendChild(item);
    });
    replaceKids(list, frag);
    list.setAttribute("aria-activedescendant", paletteFiltered[0] ? NS + "-opt-" + paletteFiltered[0].id : "");
  }

  function highlightPalette() {
    var items = qsa("." + NS + "-palette-item");
    items.forEach(function (item, i) {
      item.setAttribute("aria-selected", i === paletteIndex ? "true" : "false");
    });
    var list = document.getElementById(NS + "-palette-list");
    var active = paletteFiltered[paletteIndex];
    if (list) list.setAttribute("aria-activedescendant", active ? NS + "-opt-" + active.id : "");
    if (items[paletteIndex] && items[paletteIndex].scrollIntoView) {
      items[paletteIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function runCommand(cmd) {
    closePalette();
    if (!cmd) return;
    if (cmd.event) emit(cmd.event);
    if (cmd.action === "composer") focusComposer();
    if (cmd.action === "latest") jumpLatest();
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
    if (!document.getElementById(NS + "-palette-backdrop")) {
      var backdrop = el("div", {
        id: NS + "-palette-backdrop",
        className: NS + "-palette-backdrop",
      });
      backdrop.hidden = true;
      backdrop.addEventListener("click", closePalette);
      (document.body || document.documentElement).appendChild(backdrop);
    }
    if (document.getElementById(NS + "-palette")) return;
    var dialog = el("div", {
      id: NS + "-palette",
      className: NS + "-palette",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": NS + "-palette-title",
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
      "aria-label": "Filter commands",
      "aria-controls": NS + "-palette-list",
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

  function mountToolbar() {
    var bar = document.getElementById(NS + "-toolbar");
    if (bar && bar.isConnected) return bar;
    if (!bar) {
      bar = el("div", {
        id: NS + "-toolbar",
        className: NS + "-toolbar",
        role: "toolbar",
        "aria-label": "cwa thread actions",
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
    (document.body || document.documentElement).appendChild(bar);
    return bar;
  }

  function isTypingTarget(node) {
    if (!node || node === document.body) return false;
    var tag = (node.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (node.isContentEditable) return true;
    return false;
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

  function onSpaNavigate() {
    ensureThemeStylesheet();
    mountToolbar();
    mountPalette();
    mountMinimap();
    syncSidebar();
    scheduleMinimap();
  }

  function onMutations() {
    if (mutateTimer) clearTimeout(mutateTimer);
    mutateTimer = setTimeout(function () {
      mutateTimer = 0;
      onSpaNavigate();
    }, 80);
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

  function boot() {
    ensureThemeStylesheet();
    var host = document.body || document.documentElement;
    if (!host) {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
      return;
    }
    mountToolbar();
    mountPalette();
    mountMinimap();
    syncSidebar();
    bindObservers();
    hookHistory(onSpaNavigate);
    window.addEventListener("keydown", onGlobalKeyDown, true);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) onSpaNavigate();
    });
  }

  if (document.readyState === "loading" && !document.body) {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
    ensureThemeStylesheet();
    hookHistory(onSpaNavigate);
    window.addEventListener("keydown", onGlobalKeyDown, true);
  } else {
    boot();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
