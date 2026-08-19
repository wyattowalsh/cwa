import { describe, expect, it } from "vitest";
import lifecycleMod from "../../inject/lifecycle.js";

describe("CwaLifecycle", () => {
  it("boots idle → booting → ready", () => {
    const life = lifecycleMod.createLifecycle({ href: "https://chatgpt.com/" });
    const seen = [];
    life.subscribe((detail) => seen.push(detail.to));
    expect(life.boot()).toBe("ready");
    expect(seen).toEqual(["booting", "ready"]);
  });

  it("does not leave safe mode when boot is called again", () => {
    const life = lifecycleMod.createLifecycle();
    life.boot();
    life.enterSafe("critical-miss");

    expect(life.boot()).toBe("safe");
    expect(life.getState()).toBe("safe");
  });

  it("records SPA href changes as navigating then ready", () => {
    const life = lifecycleMod.createLifecycle({ href: "https://chatgpt.com/" });
    life.boot();
    expect(life.noteHref("https://chatgpt.com/c/11111111-2222-4333-8444-555555555555")).toBe(
      "ready"
    );
  });

  it("stays in safe mode across SPA navigation", () => {
    const life = lifecycleMod.createLifecycle({ href: "https://chatgpt.com/" });
    const transitions = [];
    life.boot();
    life.subscribe((detail) => transitions.push(detail.to));
    life.enterSafe("critical_miss:message");
    const nextHref = "https://chatgpt.com/c/abc";

    expect(life.noteHref(nextHref)).toBe("safe");
    expect(life.getState()).toBe("safe");
    expect(life.getHref()).toBe(nextHref);
    expect(transitions).not.toContain("navigating");
    expect(transitions).not.toContain("ready");
  });

  it("recovers from degraded to ready", () => {
    const life = lifecycleMod.createLifecycle();
    life.boot();
    life.degrade("missing-anchor");

    expect(life.recover()).toBe("ready");
    expect(life.getState()).toBe("ready");
  });

  it("stays safe when recovery is requested", () => {
    const life = lifecycleMod.createLifecycle();
    const transitions = [];
    life.boot();
    life.enterSafe("critical-miss");
    life.subscribe((detail) => transitions.push(detail));

    expect(life.recover()).toBe("safe");
    expect(life.getState()).toBe("safe");
    expect(transitions).toEqual([]);
  });

  it("does nothing when recovery is requested while ready", () => {
    const life = lifecycleMod.createLifecycle();
    const transitions = [];
    life.boot();
    life.subscribe((detail) => transitions.push(detail));

    expect(life.recover()).toBe("ready");
    expect(life.getState()).toBe("ready");
    expect(transitions).toEqual([]);
  });
});
