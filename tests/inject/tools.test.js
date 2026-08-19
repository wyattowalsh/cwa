import { afterEach, describe, expect, it, vi } from "vitest";
import tools from "../../inject/tools.js";
import diagnostics from "../../inject/diagnostics.js";

describe("CwaTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("exposes a local catalog without network adapters", () => {
    const ids = tools.catalog().map((item) => item.id);
    expect(ids).toEqual(["copy-visible", "save-md", "save-zip", "diagnostics"]);
    expect(JSON.stringify(tools.catalog())).not.toContain("backend-api");
  });

  it("freezes catalog records while catalog returns independent copies", () => {
    const copy = tools.catalog();
    copy[0].title = "Changed";
    copy.push({ id: "fake" });

    expect(Object.isFrozen(tools.CATALOG)).toBe(true);
    expect(tools.CATALOG.every((item) => Object.isFrozen(item))).toBe(true);
    expect(Reflect.set(tools.CATALOG[0], "title", "Changed")).toBe(false);
    expect(Reflect.set(tools.CATALOG, 0, { id: "fake" })).toBe(false);
    expect(tools.catalog().map((item) => item.id)).toEqual([
      "copy-visible",
      "save-md",
      "save-zip",
      "diagnostics",
    ]);
    expect(tools.find("copy-visible").title).toBe("Copy visible thread");
  });

  it("dispatches export events for copy/md/zip adapters", () => {
    const events = [];
    const win = {
      CustomEvent,
      dispatchEvent: (event) => {
        events.push(event.type);
        return true;
      },
    };
    expect(tools.run("copy-visible", { window: win })).toMatchObject({ ok: true, event: "cwa:copy" });
    expect(tools.run("save-md", { window: win })).toMatchObject({ ok: true, event: "cwa:save-md" });
    expect(tools.run("save-zip", { window: win })).toMatchObject({ ok: true, event: "cwa:save-zip" });
    expect(tools.run("unknown", { window: win })).toMatchObject({ ok: false, error: "unknown_tool" });
    expect(events).toEqual(["cwa:copy", "cwa:save-md", "cwa:save-zip"]);
  });

  it("reports event_unavailable when the window cannot dispatch", () => {
    expect(tools.run("save-md", { window: { CustomEvent } })).toEqual({
      ok   : false,
      error: "event_unavailable",
    });
  });

  it("reports diagnostics_unavailable when snapshot is missing or invalid", () => {
    vi.stubGlobal("CwaDiagnostics", undefined);
    expect(tools.run("diagnostics")).toEqual({
      ok   : false,
      error: "diagnostics_unavailable",
    });

    const emit = vi.fn();
    vi.stubGlobal("CwaDiagnostics", { snapshot: null, emit });
    expect(tools.run("diagnostics")).toEqual({
      ok   : false,
      error: "diagnostics_unavailable",
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("reports unhandled_tool for a catalog item without an adapter", () => {
    vi.spyOn(tools, "find").mockReturnValue({ id: "no-adapter" });
    expect(tools.run("no-adapter")).toEqual({
      ok   : false,
      error: "unhandled_tool",
    });
  });

  it("runs diagnostics without cookies or conversation JSON", () => {
    vi.stubGlobal("CwaDiagnostics", diagnostics);
    const result = tools.run("diagnostics", {
      probe    : { message: { hit: true, count: 1 } },
      lifecycle: { getState: () => "ready" },
      safeMode : { active: false },
      href     : "https://chatgpt.com/settings",
      window   : { CustomEvent, dispatchEvent: vi.fn() },
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics.hrefKind).toBe("settings");
    expect(JSON.stringify(result)).not.toContain("conversation.json");
  });
});
