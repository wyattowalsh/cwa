import { describe, expect, it, vi } from "vitest";
import tools from "../../inject/tools.js";
import diagnostics from "../../inject/diagnostics.js";

describe("CwaTools", () => {
  it("exposes a local catalog without network adapters", () => {
    const ids = tools.catalog().map((item) => item.id);
    expect(ids).toEqual(["copy-visible", "save-md", "save-zip", "diagnostics"]);
    expect(JSON.stringify(tools.catalog())).not.toContain("backend-api");
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

  it("runs diagnostics without cookies or conversation JSON", () => {
    globalThis.CwaDiagnostics = diagnostics;
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
