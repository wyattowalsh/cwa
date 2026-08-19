import { describe, expect, it } from "vitest";
import diagnostics from "../../inject/diagnostics.js";

describe("CwaDiagnostics", () => {
  it("redacts cookie, token, and authorization fields", () => {
    const out = diagnostics.redact({
      cookie: "secret=1",
      Authorization: "Bearer xyz",
      accessToken: "tok",
      lifecycle: "ready",
    });
    expect(out.cookie).toBe("[redacted]");
    expect(out.Authorization).toBe("[redacted]");
    expect(out.accessToken).toBe("[redacted]");
    expect(out.lifecycle).toBe("ready");
  });

  it("snapshot only includes allowlisted selector diagnostics", () => {
    const snap = diagnostics.snapshot({
      probe: {
        message: {
          hit: true,
          count: 2,
          selector: "[data-message-author-role]",
          critical: true,
          textContent: "SECRET_TURN_TEXT",
          payload: "sk-secret",
        },
        unexpected: { payload: "also-secret" },
      },
      lifecycle: { getState: () => "ready" },
      safeMode: { active: false, reason: "" },
      href: "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
    });

    expect(snap.schema).toBe("cwa.diagnostics.v1");
    expect(snap.lifecycle).toBe("ready");
    expect(snap.safeMode).toBe(false);
    expect(snap.code).toBe("ok");
    expect(snap.hrefKind).toBe("conversation");
    expect(Object.keys(snap.selectors)).toEqual([
      "sidebar",
      "message",
      "composer",
      "thinking",
      "citation",
      "fileCard",
    ]);
    expect(snap.selectors.message).toEqual({
      hit: true,
      selector: "[data-message-author-role]",
      count: 2,
      critical: true,
    });
    expect(snap).not.toHaveProperty("safeReason");
    expect(JSON.stringify(snap)).not.toContain("SECRET_TURN_TEXT");
    expect(JSON.stringify(snap)).not.toContain("sk-secret");
  });

  it("reports the safe-mode code when safe mode is active", () => {
    const snap = diagnostics.snapshot({
      lifecycle: "safe",
      safeMode: { isActive: () => true, reason: "SECRET_REASON" },
    });

    expect(snap.safeMode).toBe(true);
    expect(snap.code).toBe("safe_mode");
    expect(JSON.stringify(snap)).not.toContain("SECRET_REASON");
  });

  it("classifies hrefs from pathname only", () => {
    expect(diagnostics.classifyHref("https://chatgpt.com/?next=/c/fake")).toBe("other");
    expect(diagnostics.classifyHref("https://chatgpt.com/foo/c/bar")).toBe("other");
    expect(diagnostics.classifyHref("https://chatgpt.com/settings-old")).toBe("other");
    expect(diagnostics.classifyHref("https://chatgpt.com/c/11111111-2222-4333-8444-555555555555")).toBe("conversation");
    expect(diagnostics.classifyHref("https://chatgpt.com/settings")).toBe("settings");
    expect(diagnostics.classifyHref("https://chatgpt.com/settings/account")).toBe("settings");
    expect(diagnostics.classifyHref("")).toBe("other");
  });
});
