import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

const CHROME_SOURCE = readFileSync("inject/chrome.js", "utf8");

function bootChrome(options = {}) {
  const isolatedWindow = new Window({ url: "https://chatgpt.com/c/test" });
  const isolatedDocument = isolatedWindow.document;
  let active = false;
  let onSafeModeChange = null;
  let nextFrame = 1;
  const frames = new Map();
  const scriptWindow = isolatedWindow.eval("window");
  const addEventListener = isolatedWindow.addEventListener.bind(isolatedWindow);

  isolatedWindow.requestAnimationFrame = (callback) => {
    const id = nextFrame;
    nextFrame += 1;
    frames.set(id, callback);
    return id;
  };
  isolatedWindow.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  // Happy DOM exposes a distinct Window proxy inside eval(), while dispatched
  // window events target the outer Window instance. Bridge that identity gap.
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
  isolatedWindow.CwaSafeMode = {
    createSafeMode({ onChange }) {
      onSafeModeChange = onChange;
      return {
        isActive() {
          return active;
        },
        snapshot() {
          return { active, reason: active ? "test" : "", code: active ? "safe_mode" : "ok" };
        },
      };
    },
  };

  if (typeof options.setup === "function") {
    options.setup(isolatedWindow, isolatedDocument);
  }
  isolatedWindow.eval(CHROME_SOURCE);

  return {
    window: isolatedWindow,
    document: isolatedDocument,
    flushFrames() {
      const pending = Array.from(frames.values());
      frames.clear();
      pending.forEach((callback) => callback(0));
    },
    enterSafeMode() {
      active = true;
      onSafeModeChange({ active: true, reason: "test", code: "safe_mode" });
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
});
