"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const chrome = require("./chrome.js");

const {
  clampSidebarWidth,
  mapMinimapYToIndex,
  offsetToMinimapY,
  nearestOffsetIndex,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  SIDEBAR_DEFAULT,
  EVENTS,
  formatExportStatus,
  isChromeOwnedNode,
  shouldIgnoreMutations,
  isSidebarCandidate,
  isTypingTarget,
} = chrome;

test("clampSidebarWidth clamps to 200–420 and rounds", () => {
  assert.equal(clampSidebarWidth(199), SIDEBAR_MIN);
  assert.equal(clampSidebarWidth(200), SIDEBAR_MIN);
  assert.equal(clampSidebarWidth(280), 280);
  assert.equal(clampSidebarWidth(420), SIDEBAR_MAX);
  assert.equal(clampSidebarWidth(500), SIDEBAR_MAX);
  assert.equal(clampSidebarWidth(250.4), 250);
  assert.equal(clampSidebarWidth(250.6), 251);
});

test("clampSidebarWidth uses default for non-finite input", () => {
  assert.equal(clampSidebarWidth(NaN), SIDEBAR_DEFAULT);
  assert.equal(clampSidebarWidth("nope"), SIDEBAR_DEFAULT);
  assert.equal(clampSidebarWidth(undefined), SIDEBAR_DEFAULT);
  assert.equal(clampSidebarWidth(null), SIDEBAR_DEFAULT);
  assert.equal(clampSidebarWidth(""), SIDEBAR_DEFAULT);
  assert.equal(clampSidebarWidth("240"), 240);
  assert.equal(clampSidebarWidth("199.2"), SIDEBAR_MIN);
});

test("clampSidebarWidth honors custom bounds and fallback", () => {
  assert.equal(clampSidebarWidth(10, 50, 80, 60), 50);
  assert.equal(clampSidebarWidth(90, 50, 80, 60), 80);
  assert.equal(clampSidebarWidth("x", 50, 80, 60), 60);
  assert.equal(clampSidebarWidth(10, 80, 50, 60), 50);
});

test("mapMinimapYToIndex maps click Y to a message index", () => {
  assert.equal(mapMinimapYToIndex(0, 100, 4), 0);
  assert.equal(mapMinimapYToIndex(24, 100, 4), 0);
  assert.equal(mapMinimapYToIndex(25, 100, 4), 1);
  assert.equal(mapMinimapYToIndex(49, 100, 4), 1);
  assert.equal(mapMinimapYToIndex(50, 100, 4), 2);
  assert.equal(mapMinimapYToIndex(99, 100, 4), 3);
  assert.equal(mapMinimapYToIndex(100, 100, 4), 3);
  assert.equal(mapMinimapYToIndex(-8, 100, 4), 0);
});

test("mapMinimapYToIndex returns -1 for empty or invalid geometry", () => {
  assert.equal(mapMinimapYToIndex(10, 100, 0), -1);
  assert.equal(mapMinimapYToIndex(10, 0, 4), -1);
  assert.equal(mapMinimapYToIndex(10, -1, 4), -1);
});

test("offsetToMinimapY scales message offsets into the strip", () => {
  assert.equal(offsetToMinimapY(0, 1000, 100), 0);
  assert.equal(offsetToMinimapY(250, 1000, 100), 25);
  assert.equal(offsetToMinimapY(1000, 1000, 100), 99);
  assert.equal(offsetToMinimapY(-20, 1000, 100), 0);
  assert.equal(offsetToMinimapY(10, 0, 100), 0);
  assert.equal(offsetToMinimapY(10, 100, 0), 0);
});

test("nearestOffsetIndex picks the closest mounted message", () => {
  const offsets = [0, 120, 400, 900];
  assert.equal(nearestOffsetIndex(offsets, 0), 0);
  assert.equal(nearestOffsetIndex(offsets, 50), 0);
  assert.equal(nearestOffsetIndex(offsets, 70), 1);
  assert.equal(nearestOffsetIndex(offsets, 80), 1);
  assert.equal(nearestOffsetIndex(offsets, 390), 2);
  assert.equal(nearestOffsetIndex(offsets, 800), 3);
  assert.equal(nearestOffsetIndex([], 10), -1);
  assert.equal(nearestOffsetIndex(null, 10), -1);
});

test("exports the toolbar events export.js should listen for", () => {
  assert.equal(EVENTS.copy, "cwa:copy");
  assert.equal(EVENTS.saveMd, "cwa:save-md");
  assert.equal(EVENTS.saveZip, "cwa:save-zip");
});

test("formatExportStatus covers copy, zip, and denial codes", () => {
  assert.equal(formatExportStatus({ action: "copy", ok: true, code: "ok" }), "Copied visible thread");
  assert.equal(
    formatExportStatus({ action: "save-zip", ok: true, code: "partial" }),
    "Saved ZIP with media limitations"
  );
  assert.equal(formatExportStatus({ ok: false, code: "jszip_missing" }), "ZIP unavailable (JSZip missing)");
  assert.equal(formatExportStatus({ ok: false, code: "clipboard_denied" }), "Clipboard permission denied");
  assert.equal(formatExportStatus({ ok: false, code: "duplicate" }), "Export already in progress");
  assert.equal(
    formatExportStatus({ ok: true, code: "safe_mode" }),
    "Safe mode: chrome limited, export still available"
  );
  assert.equal(
    formatExportStatus({ ok: true, code: "native_unavailable" }),
    "Native companion unavailable; used browser download"
  );
  assert.equal(
    formatExportStatus({ ok: false, code: "route_changed" }),
    "Conversation changed during export"
  );
});

test("isTypingTarget recognizes form controls and plaintext-only editors", () => {
  const editor = {};
  const plaintextChild = {
    tagName: "SPAN",
    closest(selector) {
      return selector.includes("plaintext-only") ? editor : null;
    },
  };

  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "textarea" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget(plaintextChild), true);
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget(null), false);
});

test("isSidebarCandidate rejects chrome decoys and exact geometry bounds", () => {
  function sidebar(rect, chromeOwned) {
    return {
      nodeType: 1,
      closest() {
        return chromeOwned ? this : null;
      },
      getBoundingClientRect() {
        return rect;
      },
    };
  }

  assert.equal(isSidebarCandidate(sidebar({ height: 500, width: 240, left: 20 }, false)), true);
  assert.equal(isSidebarCandidate(sidebar({ height: 500, width: 240, left: 20 }, true)), false);
  assert.equal(isSidebarCandidate(sidebar({ height: 120, width: 240, left: 20 }, false)), false);
  assert.equal(isSidebarCandidate(sidebar({ height: 500, width: 40, left: 20 }, false)), false);
  assert.equal(isSidebarCandidate(sidebar({ height: 500, width: 240, left: 280 }, false)), false);
});

test("shouldIgnoreMutations ignores only chrome-owned mutation batches", () => {
  function element(chromeOwned, className) {
    return {
      nodeType: 1,
      className: className || "",
      closest(selector) {
        return chromeOwned && selector === "[data-cwa-chrome]" ? this : null;
      },
    };
  }

  const chromeNode = element(true);
  const providerNode = element(false);
  const scroller = element(false, "cwa-scroller");

  assert.equal(isChromeOwnedNode(chromeNode), true);
  assert.equal(shouldIgnoreMutations([
    { type: "attributes", target: chromeNode },
    { type: "childList", target: providerNode, addedNodes: [chromeNode], removedNodes: [] },
  ]), true);
  assert.equal(shouldIgnoreMutations([
    { type: "childList", target: chromeNode, addedNodes: [], removedNodes: [providerNode] },
  ]), true);
  assert.equal(shouldIgnoreMutations([
    { type: "childList", target: providerNode, addedNodes: [chromeNode, providerNode], removedNodes: [] },
  ]), false);
  assert.equal(shouldIgnoreMutations([
    { type: "attributes", target: scroller },
  ]), false);
  assert.equal(shouldIgnoreMutations([]), false);
});

test("requiring chrome.js in node does not boot DOM chrome", () => {
  assert.equal(global.__CWA_CHROME_BOOTED__, undefined);
  assert.equal(typeof chrome.clampSidebarWidth, "function");
});
