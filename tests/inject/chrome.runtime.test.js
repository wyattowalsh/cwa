import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const WAVE2_SOURCES = [
  "inject/selectors.js",
  "inject/scheduler.js",
  "inject/lifecycle.js",
  "inject/safe-mode.js",
].map((path) => readFileSync(path, "utf8"));
const CHROME_SOURCE = readFileSync("inject/chrome.js", "utf8");

function bootChrome(options = {}) {
  const isolatedWindow = new Window({ url: options.url || "https://chatgpt.com/" });
  const isolatedDocument = isolatedWindow.document;
  let nextFrame = 1;
  const frames = new Map();
  let nextTimer = 1;
  const timers = new Map();
  const scriptWindow = isolatedWindow.eval("window");
  const addEventListener = isolatedWindow.addEventListener.bind(isolatedWindow);
  let safeModeApi = null;

  isolatedWindow.requestAnimationFrame = (callback) => {
    const id = nextFrame;
    nextFrame += 1;
    frames.set(id, callback);
    return id;
  };
  isolatedWindow.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  isolatedWindow.setTimeout = (callback) => {
    const id = nextTimer;
    nextTimer += 1;
    timers.set(id, callback);
    return id;
  };
  isolatedWindow.clearTimeout = (id) => {
    timers.delete(id);
  };
  isolatedWindow.addEventListener = (type, listener, listenerOptions) => {
    if (type === "cwa:export-status") {
      addEventListener(type, (event) => {
        listener({
          target: event.target === isolatedWindow ? scriptWindow : event.target,
          detail: event.detail,
        });
      }, listenerOptions);
      return;
    }
    addEventListener(type, listener, listenerOptions);
  };

  WAVE2_SOURCES.forEach((source) => {
    isolatedWindow.eval(source);
  });
  const createSafeMode = isolatedWindow.CwaSafeMode.createSafeMode.bind(isolatedWindow.CwaSafeMode);
  isolatedWindow.CwaSafeMode.createSafeMode = (safeOptions) => {
    safeModeApi = createSafeMode(safeOptions);
    return safeModeApi;
  };

  if (typeof options.setup === "function") {
    options.setup(isolatedWindow, isolatedDocument);
  }
  isolatedWindow.eval(CHROME_SOURCE);

  function flushTimeouts() {
    const pending = Array.from(timers.values());
    timers.clear();
    pending.forEach((callback) => callback());
  }

  function flushFrames() {
    const pending = Array.from(frames.values());
    frames.clear();
    pending.forEach((callback) => callback(0));
  }

  return {
    window  : isolatedWindow,
    document: isolatedDocument,
    flushTimeouts,
    flushFrames,
    flushAll() {
      flushTimeouts();
      flushFrames();
    },
    enterSafeMode() {
      if (safeModeApi && typeof safeModeApi.enter === "function") {
        safeModeApi.enter("test");
      }
    },
    resetSafeMode() {
      if (safeModeApi && typeof safeModeApi.reset === "function") {
        safeModeApi.reset();
      }
    },
  };
}

function propertyDescriptor(object, name) {
  let current = object;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
    current = Object.getPrototypeOf(current);
  }
  return null;
}

describe("chrome runtime isolation", () => {
  it("adds the scroller class once across rebuilds and removes it in safe mode", () => {
    let main;
    let scrollerClassAdds = 0;
    const runtime = bootChrome({
      setup(_window, document) {
        main = document.createElement("main");
        const classListAdd = main.classList.add.bind(main.classList);
        main.classList.add = (...tokens) => {
          if (tokens.includes("cwa-scroller")) scrollerClassAdds += 1;
          return classListAdd(...tokens);
        };
        const message = document.createElement("div");
        message.setAttribute("data-message-author-role", "assistant");
        message.getBoundingClientRect = () => ({
          top: 0,
          left: 0,
          width: 500,
          height: 200,
          right: 500,
          bottom: 200,
        });
        main.appendChild(message);
        document.body.appendChild(main);
      },
    });

    try {
      runtime.flushFrames();
      expect(runtime.document.getElementById("cwa-minimap")).not.toBeNull();
      expect(main.classList.contains("cwa-scroller")).toBe(true);
      expect(scrollerClassAdds).toBe(1);

      runtime.window.dispatchEvent(new runtime.window.Event("resize"));
      runtime.flushFrames();

      expect(main.classList.contains("cwa-scroller")).toBe(true);
      expect(scrollerClassAdds).toBe(1);

      runtime.enterSafeMode();

      expect(runtime.document.getElementById("cwa-minimap")).toBeNull();
      expect(main.classList.contains("cwa-scroller")).toBe(false);
    } finally {
      runtime.window.close();
    }
  });

  it("handles duplicate window and document status dispatches once", () => {
    const runtime = bootChrome();

    try {
      const status = runtime.document.getElementById("cwa-export-status");
      const descriptor = propertyDescriptor(status, "textContent");
      let writes = 0;
      let hiddenWhenWritten = null;
      Object.defineProperty(status, "textContent", {
        configurable: true,
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          writes += 1;
          hiddenWhenWritten = this.hidden;
          descriptor.set.call(this, value);
        },
      });
      const detail = { action: "copy", ok: true, code: "ok" };

      runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:export-status", {
        bubbles: true,
        detail,
      }));
      runtime.document.dispatchEvent(new runtime.window.CustomEvent("cwa:export-status", {
        bubbles: true,
        detail,
      }));

      expect(writes).toBe(1);
      expect(hiddenWhenWritten).toBe(false);
      expect(status.textContent).toBe("Copied visible thread");
      expect(status.getAttribute("data-ok")).toBe("true");
      expect(status.getAttribute("data-code")).toBe("ok");
    } finally {
      runtime.window.close();
    }
  });

  it("moves the scroller class when the conversation scroller node changes", () => {
    function makeScroller(document, id) {
      const node = document.createElement("div");
      node.id = id;
      node.style.overflowY = "auto";
      Object.defineProperty(node, "scrollHeight", {
        configurable: true,
        get() {
          return 1000;
        },
      });
      Object.defineProperty(node, "clientHeight", {
        configurable: true,
        get() {
          return 100;
        },
      });
      return node;
    }

    let firstScroller;
    let secondScroller;
    const runtime = bootChrome({
      setup(_window, document) {
        firstScroller  = makeScroller(document, "scroll-a");
        secondScroller = makeScroller(document, "scroll-b");
        const main = document.createElement("main");
        const message = document.createElement("div");
        message.setAttribute("data-message-author-role", "assistant");
        message.getBoundingClientRect = () => ({
          top   : 0,
          left  : 0,
          width : 500,
          height: 200,
          right : 500,
          bottom: 200,
        });
        main.appendChild(message);
        firstScroller.appendChild(main);
        document.body.appendChild(firstScroller);
        document.body.appendChild(secondScroller);
      },
    });

    try {
      runtime.flushFrames();
      expect(firstScroller.classList.contains("cwa-scroller")).toBe(true);
      expect(secondScroller.classList.contains("cwa-scroller")).toBe(false);
      expect(firstScroller.hasAttribute("data-cwa-chrome")).toBe(false);

      const main = runtime.document.querySelector("main");
      secondScroller.appendChild(main);
      runtime.window.dispatchEvent(new runtime.window.Event("resize"));
      runtime.flushFrames();

      expect(firstScroller.classList.contains("cwa-scroller")).toBe(false);
      expect(secondScroller.classList.contains("cwa-scroller")).toBe(true);
      expect(secondScroller.hasAttribute("data-cwa-chrome")).toBe(false);

      runtime.enterSafeMode();
      expect(runtime.document.getElementById("cwa-minimap")).toBeNull();
      expect(firstScroller.classList.contains("cwa-scroller")).toBe(false);
      expect(secondScroller.classList.contains("cwa-scroller")).toBe(false);
    } finally {
      runtime.window.close();
    }
  });

  it("skips missing catalog tools instead of falling back to legacy copy", () => {
    const runtime = bootChrome({
      setup(window) {
        window.CwaTools = {
          catalog() {
            return [
              { id: "save-md", title: "Save as Markdown", event: "cwa:save-md", keywords: "download" },
              { id: "save-zip", title: "Save zip (best effort)", event: "cwa:save-zip", keywords: "archive" },
            ];
          },
          find(id) {
            return this.catalog().find((item) => item.id === id) || null;
          },
          run() {
            return { ok: true };
          },
        };
      },
    });

    try {
      const trigger = runtime.document.querySelector("[data-cwa-action='palette']");
      expect(trigger).not.toBeNull();
      trigger.click();
      const ids = Array.from(runtime.document.querySelectorAll(".cwa-palette-item"))
        .map((item) => item.getAttribute("data-id"));
      expect(ids).toEqual(["save-md", "save-zip", "composer", "latest", "find"]);
      expect(ids).not.toContain("copy");
      expect(ids).not.toContain("diagnostics");
    } finally {
      runtime.window.close();
    }
  });

  it("falls back to event palette ids when the tools API is absent", () => {
    const runtime = bootChrome();

    try {
      const trigger = runtime.document.querySelector("[data-cwa-action='palette']");
      trigger.click();
      const ids = Array.from(runtime.document.querySelectorAll(".cwa-palette-item"))
        .map((item) => item.getAttribute("data-id"));
      expect(ids).toContain("copy");
      expect(ids).toContain("composer");
    } finally {
      runtime.window.close();
    }
  });

  it("does not steal export shortcuts from typing targets", () => {
    const runtime = bootChrome();

    try {
      const textarea = runtime.document.createElement("textarea");
      runtime.document.body.appendChild(textarea);
      let copies = 0;
      runtime.window.addEventListener("cwa:copy", () => {
        copies += 1;
      });
      const event = new runtime.window.KeyboardEvent("keydown", {
        key: "c",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      const dispatched = textarea.dispatchEvent(event);

      expect(dispatched).toBe(true);
      expect(event.defaultPrevented).toBe(false);
      expect(copies).toBe(0);
    } finally {
      runtime.window.close();
    }
  });

  it("ignores off-main messages when building the minimap", () => {
    const bounds = () => ({
      top   : 0,
      left  : 0,
      width : 500,
      height: 200,
      right : 500,
      bottom: 200,
    });
    const runtime = bootChrome({
      setup(_window, document) {
        const decoy = document.createElement("div");
        decoy.setAttribute("data-message-author-role", "assistant");
        decoy.getBoundingClientRect = bounds;
        document.body.appendChild(decoy);
        const main = document.createElement("main");
        const message = document.createElement("div");
        message.setAttribute("data-message-author-role", "user");
        message.getBoundingClientRect = bounds;
        main.appendChild(message);
        document.body.appendChild(main);
      },
    });

    try {
      runtime.flushFrames();
      const strip = runtime.document.getElementById("cwa-minimap");
      expect(strip).not.toBeNull();
      expect(strip.getAttribute("data-count")).toBe("1");
    } finally {
      runtime.window.close();
    }
  });

  it("tears down the previous sidebar handle when the candidate changes", () => {
    const sidebarRect = {
      top   : 0,
      left  : 0,
      width : 240,
      height: 400,
      right : 240,
      bottom: 400,
    };
    let first;
    let second;
    const runtime = bootChrome({
      setup(_window, document) {
        first = document.createElement("nav");
        first.setAttribute("aria-label", "Chat history");
        first.getBoundingClientRect = () => sidebarRect;
        second = document.createElement("nav");
        second.setAttribute("aria-label", "Chat history");
        second.getBoundingClientRect = () => sidebarRect;
        document.body.appendChild(first);
      },
    });

    try {
      runtime.flushFrames();
      expect(first.querySelector(".cwa-sidebar-handle")).not.toBeNull();

      first.remove();
      runtime.document.body.appendChild(second);
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushAll();

      expect(first.querySelector(".cwa-sidebar-handle")).toBeNull();
      expect(second.querySelector(".cwa-sidebar-handle")).not.toBeNull();

      runtime.enterSafeMode();
      expect(second.querySelector(".cwa-sidebar-handle")).toBeNull();
    } finally {
      runtime.window.close();
    }
  });

  it("repairs partial sidebar geometry and restores it when the sidebar disappears", () => {
    const sidebarRect = {
      top   : 0,
      left  : 0,
      width : 240,
      height: 400,
      right : 240,
      bottom: 400,
    };
    let sidebar;
    const runtime = bootChrome({
      setup(_window, document) {
        document.documentElement.style.setProperty("--sidebar-width", "164px");
        sidebar = document.createElement("nav");
        sidebar.setAttribute("aria-label", "Chat history");
        sidebar.style.setProperty("width", "240px");
        sidebar.style.setProperty("min-width", "180px");
        sidebar.style.setProperty("position", "absolute");
        sidebar.getBoundingClientRect = () => sidebarRect;
        document.body.appendChild(sidebar);
      },
    });

    try {
      runtime.flushFrames();
      expect(sidebar.style.getPropertyValue("width")).toBe("280px");
      expect(sidebar.style.getPropertyValue("min-width")).toBe("280px");
      expect(sidebar.style.getPropertyPriority("min-width")).toBe("important");
      expect(runtime.document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("280px");

      sidebar.style.removeProperty("min-width");
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();

      expect(sidebar.style.getPropertyValue("min-width")).toBe("280px");
      expect(sidebar.style.getPropertyPriority("min-width")).toBe("important");

      sidebar.remove();
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();

      expect(sidebar.querySelector(".cwa-sidebar-handle")).toBeNull();
      expect(sidebar.style.getPropertyValue("width")).toBe("240px");
      expect(sidebar.style.getPropertyValue("min-width")).toBe("180px");
      expect(sidebar.style.getPropertyValue("position")).toBe("absolute");
      expect(runtime.document.documentElement.style.getPropertyValue("--sidebar-width")).toBe("164px");
    } finally {
      runtime.window.close();
    }
  });

  it("uses in-main article fallbacks when a document-wide role decoy exists", () => {
    const bounds = () => ({
      top   : 0,
      left  : 0,
      width : 500,
      height: 200,
      right : 500,
      bottom: 200,
    });
    const runtime = bootChrome({
      setup(_window, document) {
        const decoy = document.createElement("div");
        decoy.setAttribute("data-message-author-role", "assistant");
        decoy.getBoundingClientRect = bounds;
        document.body.appendChild(decoy);
        const main = document.createElement("main");
        const article = document.createElement("article");
        article.setAttribute("data-testid", "conversation-turn-1");
        article.getBoundingClientRect = bounds;
        main.appendChild(article);
        document.body.appendChild(main);
      },
    });

    try {
      runtime.flushFrames();
      const strip = runtime.document.getElementById("cwa-minimap");
      expect(strip).not.toBeNull();
      expect(strip.getAttribute("data-count")).toBe("1");
    } finally {
      runtime.window.close();
    }
  });

  it("does not enter safe mode from home hydration misses", () => {
    const runtime = bootChrome({ url: "https://chatgpt.com/" });

    try {
      for (let i = 0; i < 5; i += 1) {
        runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
        runtime.flushTimeouts();
      }
      expect(runtime.document.getElementById("cwa-minimap")).not.toBeNull();
      expect(runtime.document.getElementById("cwa-toolbar")).not.toBeNull();
    } finally {
      runtime.window.close();
    }
  });

  it("enters safe mode after consecutive misses on a settled conversation route", () => {
    const runtime = bootChrome({
      url: "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
    });

    try {
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();

      expect(runtime.document.getElementById("cwa-minimap")).toBeNull();
      expect(runtime.document.getElementById("cwa-toolbar")).not.toBeNull();
    } finally {
      runtime.window.close();
    }
  });

  it("coalesces rapid history navigations into one compat refresh", () => {
    const runtime = bootChrome({
      url: "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
    });

    try {
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();

      expect(runtime.document.getElementById("cwa-minimap")).not.toBeNull();
    } finally {
      runtime.window.close();
    }
  });

  it("keeps document sidebar hits while scoping message probes to main", () => {
    const bounds = () => ({
      top   : 0,
      left  : 0,
      width : 240,
      height: 400,
      right : 240,
      bottom: 400,
    });
    const runtime = bootChrome({
      url: "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
      setup(_window, document) {
        const sidebar = document.createElement("nav");
        sidebar.setAttribute("aria-label", "Chat history");
        sidebar.getBoundingClientRect = bounds;
        document.body.appendChild(sidebar);
        const decoy = document.createElement("div");
        decoy.setAttribute("data-message-author-role", "assistant");
        decoy.getBoundingClientRect = bounds;
        document.body.appendChild(decoy);
        document.body.appendChild(document.createElement("main"));
      },
    });

    try {
      runtime.flushAll();
      expect(runtime.window.CwaChrome.runtime().lifecycle).toBe("ready");
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();
      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();
      expect(runtime.document.getElementById("cwa-minimap")).toBeNull();
      expect(runtime.window.CwaChrome.runtime().lifecycle).toBe("safe");
    } finally {
      runtime.window.close();
    }
  });

  it("does not snap sidebar width while a resize drag is in progress", () => {
    const sidebarRect = {
      top   : 0,
      left  : 0,
      width : 240,
      height: 400,
      right : 240,
      bottom: 400,
    };
    let sidebar;
    const runtime = bootChrome({
      setup(_window, document) {
        sidebar = document.createElement("nav");
        sidebar.setAttribute("aria-label", "Chat history");
        sidebar.getBoundingClientRect = () => sidebarRect;
        document.body.appendChild(sidebar);
      },
    });

    try {
      runtime.flushFrames();
      const handle = sidebar.querySelector(".cwa-sidebar-handle");
      expect(handle).not.toBeNull();
      expect(sidebar.style.getPropertyValue("width")).toBe("280px");

      handle.dispatchEvent(new runtime.window.PointerEvent("pointerdown", {
        bubbles  : true,
        button   : 0,
        clientX  : 0,
        pointerId: 1,
      }));
      handle.dispatchEvent(new runtime.window.PointerEvent("pointermove", {
        bubbles  : true,
        button   : 0,
        clientX  : 80,
        pointerId: 1,
      }));
      expect(sidebar.style.getPropertyValue("width")).toBe("320px");

      runtime.window.dispatchEvent(new runtime.window.PopStateEvent("popstate"));
      runtime.flushTimeouts();

      expect(sidebar.style.getPropertyValue("width")).toBe("320px");
    } finally {
      runtime.window.close();
    }
  });

  it("remounts chrome when safe mode deactivates", () => {
    const runtime = bootChrome({
      url: "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
    });

    try {
      runtime.enterSafeMode();
      expect(runtime.document.getElementById("cwa-minimap")).toBeNull();
      expect(runtime.document.getElementById("cwa-toolbar")).not.toBeNull();

      runtime.resetSafeMode();
      expect(runtime.document.getElementById("cwa-minimap")).not.toBeNull();
      expect(runtime.document.getElementById("cwa-toolbar")).not.toBeNull();
    } finally {
      runtime.window.close();
    }
  });
});
