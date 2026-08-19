import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";

const EXPORT_CORE_SOURCE = readFileSync("inject/export-core.js", "utf8");
const NATIVE_BRIDGE_SOURCE = readFileSync("inject/native-bridge.js", "utf8");
const EXPORT_SOURCE = readFileSync("inject/export.js", "utf8");
const JSZIP_STUB_SOURCE = `
  (function (global) {
    function FakeZip() {
      this.files = {};
    }
    FakeZip.prototype.file = function (path, content) {
      this.files[path] = content;
      return this;
    };
    FakeZip.prototype.generateAsync = function () {
      return Promise.resolve(new Blob(["ZIP"], { type: "application/zip" }));
    };
    global.JSZip = FakeZip;
  })(window);
`;

function bootExport(options = {}) {
  const isolatedWindow = new Window({ url: "https://chatgpt.com/c/test" });
  const scriptWindow = isolatedWindow.eval("window");
  const fetchImpl = vi.fn(() => Promise.reject(new Error("unexpected network request")));

  if (options.withJSZip) {
    isolatedWindow.eval(JSZIP_STUB_SOURCE);
  }
  isolatedWindow.eval(EXPORT_CORE_SOURCE);
  isolatedWindow.eval(NATIVE_BRIDGE_SOURCE);
  if (options.nativeHost) {
    scriptWindow.__cwaNative = options.nativeHost;
  }
  scriptWindow.fetch = fetchImpl;

  const triggerDownload = vi.fn(() => true);
  scriptWindow.CwaExportCore.triggerDownload = triggerDownload;
  isolatedWindow.eval(EXPORT_SOURCE);

  return {
    window: isolatedWindow,
    scriptWindow,
    triggerDownload,
    fetchImpl,
  };
}

describe("export page-world boot", () => {
  it("boots without a native host and uses the browser download fallback", async () => {
    const runtime = bootExport();

    try {
      expect(runtime.scriptWindow.CwaExport).toBeDefined();

      await expect(runtime.scriptWindow.CwaExport.saveMarkdown()).resolves.toMatchObject({
        ok: true,
      });
      expect(runtime.triggerDownload).toHaveBeenCalledTimes(1);
    } finally {
      runtime.window.close();
    }
  });

  it("uses the native host without attempting a browser download", async () => {
    const nativeHost = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    const runtime = bootExport({ nativeHost });

    try {
      await expect(runtime.scriptWindow.CwaExport.saveMarkdown()).resolves.toMatchObject({
        ok: true,
      });
      expect(nativeHost.saveFile).toHaveBeenCalledTimes(1);
      expect(runtime.triggerDownload).not.toHaveBeenCalled();
    } finally {
      runtime.window.close();
    }
  });

  it("saves ZIP through the native host when JSZip is loaded", async () => {
    const nativeHost = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    const runtime = bootExport({ nativeHost, withJSZip: true });

    try {
      await expect(runtime.scriptWindow.CwaExport.saveZip()).resolves.toMatchObject({
        ok   : true,
        files: ["chat.md", "MANIFEST.md", "manifest.json"],
      });
      expect(nativeHost.saveFile).toHaveBeenCalledTimes(1);
      expect(nativeHost.saveFile.mock.calls[0][0]).toMatchObject({
        filename: expect.stringMatching(/\.zip$/),
        mime    : "application/zip",
      });
      expect(runtime.triggerDownload).not.toHaveBeenCalled();
      expect(runtime.fetchImpl).not.toHaveBeenCalled();
    } finally {
      runtime.window.close();
    }
  });

  it("returns jszip_missing without native or browser fallback when JSZip is absent", async () => {
    const nativeHost = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    const runtime = bootExport({ nativeHost });

    try {
      expect(runtime.scriptWindow.JSZip).toBeUndefined();
      await expect(runtime.scriptWindow.CwaExport.saveZip()).resolves.toEqual({
        ok   : false,
        error: "jszip_missing",
      });
      expect(nativeHost.saveFile).not.toHaveBeenCalled();
      expect(runtime.triggerDownload).not.toHaveBeenCalled();
      expect(runtime.fetchImpl).not.toHaveBeenCalled();
    } finally {
      runtime.window.close();
    }
  });

  it("does not fall back to a browser download after a native_error", async () => {
    const nativeHost = {
      saveFile: vi.fn(() => Promise.reject(new Error("native save failed"))),
    };
    const runtime = bootExport({ nativeHost });

    try {
      await expect(runtime.scriptWindow.CwaExport.saveMarkdown()).resolves.toMatchObject({
        ok   : false,
        error: "download_denied",
      });
      expect(nativeHost.saveFile).toHaveBeenCalledTimes(1);
      expect(runtime.triggerDownload).not.toHaveBeenCalled();
    } finally {
      runtime.window.close();
    }
  });

  it("falls back to a browser download when the native payload is rejected", async () => {
    const nativeHost = {
      saveFile: vi.fn(async () => ({ ok: false, error: "invalid_payload" })),
    };
    const runtime = bootExport({ nativeHost });

    try {
      await expect(runtime.scriptWindow.CwaExport.saveMarkdown()).resolves.toMatchObject({
        ok: true,
      });
      expect(nativeHost.saveFile).toHaveBeenCalledTimes(1);
      expect(runtime.triggerDownload).toHaveBeenCalledTimes(1);
    } finally {
      runtime.window.close();
    }
  });

  it("marks every export command detail as handled synchronously", async () => {
    const nativeHost = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    const runtime = bootExport({ nativeHost });
    const statuses = [];

    try {
      runtime.window.addEventListener("cwa:export-status", (event) => {
        statuses.push(event.detail.action);
      });

      ["cwa:copy", "cwa:save-md", "cwa:save-zip"].forEach((type) => {
        const detail = {};
        runtime.window.dispatchEvent(new runtime.window.CustomEvent(type, { detail }));
        expect(detail.handled).toBe(true);
      });

      await vi.waitFor(() => {
        expect(new Set(statuses)).toEqual(new Set(["copy", "save-md", "save-zip"]));
      });
    } finally {
      runtime.window.close();
    }
  });

  it("emits a failure status when an export command rejects", async () => {
    const runtime = bootExport();
    const statuses = [];

    try {
      runtime.window.addEventListener("cwa:export-status", (event) => {
        statuses.push(event.detail);
      });
      runtime.scriptWindow.CwaExport.saveMarkdown = () => Promise.reject(new Error("boom"));
      const detail = {};
      runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:save-md", { detail }));
      expect(detail.handled).toBe(true);
      await vi.waitFor(() => {
        expect(statuses).toContainEqual(expect.objectContaining({
          action: "save-md",
          ok    : false,
          code  : "error",
        }));
      });
    } finally {
      runtime.window.close();
    }
  });

  it("contains synchronous export failures and clears the in-flight guard", async () => {
    const runtime = bootExport();
    const statuses = [];

    try {
      runtime.window.addEventListener("cwa:export-status", (event) => {
        statuses.push(event.detail);
      });
      runtime.scriptWindow.CwaExport.saveMarkdown = vi.fn(() => {
        throw new Error("boom");
      });

      const first = {};
      expect(() => {
        runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:save-md", {
          detail: first,
        }));
      }).not.toThrow();
      expect(first.handled).toBe(true);
      await vi.waitFor(() => {
        expect(statuses).toContainEqual(expect.objectContaining({
          action: "save-md",
          ok    : false,
          code  : "error",
        }));
      });

      runtime.scriptWindow.CwaExport.saveMarkdown = vi.fn(() => Promise.resolve({ ok: true }));
      const second = {};
      runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:save-md", {
        detail: second,
      }));
      expect(second.handled).toBe(true);
      await vi.waitFor(() => {
        expect(runtime.scriptWindow.CwaExport.saveMarkdown).toHaveBeenCalledTimes(1);
      });
      expect(statuses).not.toContainEqual(expect.objectContaining({ code: "duplicate" }));
    } finally {
      runtime.window.close();
    }
  });

  it("releases inflight even when failure status dispatch throws", async () => {
    const runtime = bootExport();

    try {
      runtime.scriptWindow.CwaExport.saveMarkdown = vi.fn(() => {
        throw new Error("boom");
      });
      runtime.window.addEventListener("cwa:export-status", () => {
        throw new Error("status listener failed");
      });

      const first = {};
      runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:save-md", {
        detail: first,
      }));
      expect(first.handled).toBe(true);
      await vi.waitFor(() => {
        expect(runtime.scriptWindow.CwaExport.saveMarkdown).toHaveBeenCalledTimes(1);
      });

      runtime.scriptWindow.CwaExport.saveMarkdown = vi.fn(() => Promise.resolve({ ok: true }));
      const second = {};
      runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:save-md", {
        detail: second,
      }));
      await vi.waitFor(() => {
        expect(runtime.scriptWindow.CwaExport.saveMarkdown).toHaveBeenCalledTimes(1);
      });
      expect(second.handled).toBe(true);
    } finally {
      runtime.window.close();
    }
  });

  it("emits duplicate for a second in-flight save-zip without starting another export", async () => {
    const runtime = bootExport({ withJSZip: true });
    const statuses = [];

    try {
      runtime.window.addEventListener("cwa:export-status", (event) => {
        statuses.push(event.detail);
      });
      runtime.scriptWindow.CwaExport.saveZip = vi.fn(() => new Promise(() => {}));

      const first = {};
      const second = {};
      runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:save-zip", {
        detail: first,
      }));
      runtime.window.dispatchEvent(new runtime.window.CustomEvent("cwa:save-zip", {
        detail: second,
      }));
      expect(first.handled).toBe(true);
      expect(second.handled).toBe(true);
      await vi.waitFor(() => {
        expect(statuses).toContainEqual(expect.objectContaining({
          action: "save-zip",
          ok    : false,
          code  : "duplicate",
        }));
      });
      expect(runtime.scriptWindow.CwaExport.saveZip).toHaveBeenCalledTimes(1);
    } finally {
      runtime.window.close();
    }
  });
});
