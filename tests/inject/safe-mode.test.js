import { describe, expect, it } from "vitest";
import selectors from "../../inject/selectors.js";
import safeModeMod from "../../inject/safe-mode.js";

describe("CwaSafeMode", () => {
  it("enters after consecutive critical selector misses", () => {
    document.body.replaceChildren(document.createElement("main"));
    const probe = selectors.probe(document);
    const mode = safeModeMod.createSafeMode({ strikes: 3 });
    expect(mode.observe(probe).active).toBe(false);
    expect(mode.observe(probe).active).toBe(false);
    expect(mode.observe(probe).active).toBe(true);
    expect(mode.snapshot().code).toBe("safe_mode");
  });

  it("resets strikes when messages appear", () => {
    const mode = safeModeMod.createSafeMode({ strikes: 3 });
    document.body.replaceChildren(document.createElement("main"));
    mode.observe(selectors.probe(document));
    const msg = document.createElement("div");
    msg.setAttribute("data-message-author-role", "user");
    document.body.appendChild(msg);
    expect(mode.observe(selectors.probe(document)).strikes).toBe(0);
    expect(mode.isActive()).toBe(false);
  });

  it("does not strike for non-critical sidebar and composer misses", () => {
    const msg = document.createElement("div");
    msg.setAttribute("data-message-author-role", "assistant");
    document.body.replaceChildren(msg);
    const probe = selectors.probe(document);
    const mode = safeModeMod.createSafeMode({ strikes: 3 });

    expect(probe.sidebar.hit).toBe(false);
    expect(probe.composer.hit).toBe(false);
    expect(probe.message.hit).toBe(true);
    expect(mode.observe(probe).strikes).toBe(0);
    expect(mode.isActive()).toBe(false);
  });

  it("requires consecutive misses after a hit resets the strike count", () => {
    const mode = safeModeMod.createSafeMode({ strikes: 3 });
    const empty = document.createElement("main");
    document.body.replaceChildren(empty);
    const miss = selectors.probe(document);

    expect(mode.observe(miss).active).toBe(false);
    expect(mode.observe(miss).active).toBe(false);

    const msg = document.createElement("div");
    msg.setAttribute("data-message-author-role", "user");
    document.body.replaceChildren(msg);
    expect(mode.observe(selectors.probe(document)).strikes).toBe(0);

    document.body.replaceChildren(empty);
    expect(mode.observe(miss).active).toBe(false);
    expect(mode.observe(miss).active).toBe(false);
    expect(mode.isActive()).toBe(false);
    expect(mode.observe(miss).active).toBe(true);
  });

  it("leaves safe mode and notifies when critical selectors return", () => {
    const changes = [];
    const mode = safeModeMod.createSafeMode({
      strikes : 1,
      onChange: (snap) => changes.push(snap.active),
    });
    document.body.replaceChildren(document.createElement("main"));
    expect(mode.observe(selectors.probe(document)).active).toBe(true);

    const msg = document.createElement("div");
    msg.setAttribute("data-message-author-role", "user");
    document.body.appendChild(msg);
    expect(mode.observe(selectors.probe(document)).active).toBe(false);
    expect(mode.isActive()).toBe(false);
    expect(changes).toEqual([true, false]);
  });
});
