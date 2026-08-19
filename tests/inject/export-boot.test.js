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

  it("falls back to a browser download when the native host rejects", async () => {
    const nativeHost = {
      saveFile: vi.fn(() => Promise.reject(new Error("native save failed"))),
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
});
