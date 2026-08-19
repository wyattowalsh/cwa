import { describe, expect, it } from "vitest";
import selectors from "../../inject/selectors.js";

describe("CwaSelectors", () => {
  it("rejects empty and all class-only selectors", () => {
    [
      "",
      "   ",
      ".abcXYZhashed1",
      ".a1b2c3",
      "._a1b2c3",
      ".abcXYZhashed1.otherHash999",
    ].forEach((selector) => {
      expect(selectors.isUnsafeSelector(selector)).toBe(true);
    });

    expect(selectors.isUnsafeSelector("[data-testid='sidebar']")).toBe(false);
    expect(selectors.isUnsafeSelector("nav[aria-label*='Chat' i]")).toBe(false);
    expect(
      selectors.isUnsafeSelector('article[data-testid^="conversation-turn-"]')
    ).toBe(false);
    expect(selectors.isUnsafeSelector(".foo\\:bar")).toBe(true);
    expect(selectors.isUnsafeSelector(".éhash")).toBe(true);
  });

  it("resolves messages from data-message-author-role without hashed classes", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.setAttribute("data-message-author-role", "user");
    wrap.textContent = "hello";
    document.body.appendChild(wrap);

    const resolved = selectors.resolve(document, "message");
    expect(resolved.hit).toBe(true);
    expect(resolved.selector).toBe("[data-message-author-role]");
    expect(resolved.critical).toBe(true);
  });

  it("uses the ordered article fallback when the primary message selector misses", () => {
    const article = document.createElement("article");
    article.setAttribute("data-testid", "conversation-turn-1");
    document.body.replaceChildren(article);

    const resolved = selectors.resolve(document, "message");
    expect(resolved.hit).toBe(true);
    expect(resolved.selector).toBe('article[data-testid^="conversation-turn-"]');
    expect(resolved.node).toBe(article);
  });

  it("probes without copying message text into the snapshot", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.setAttribute("data-message-author-role", "assistant");
    wrap.textContent = "SECRET_TURN_TEXT";
    document.body.appendChild(wrap);

    const snapshot = selectors.probe(document);
    expect(JSON.stringify(snapshot)).not.toContain("SECRET_TURN_TEXT");
    expect(snapshot.message.hit).toBe(true);
    expect(selectors.criticalMisses(snapshot)).toEqual([]);
  });

  it("reports a critical miss when no messages are mounted", () => {
    const main = document.createElement("main");
    const empty = document.createElement("p");
    empty.textContent = "empty";
    main.appendChild(empty);
    document.body.replaceChildren(main);

    const snapshot = selectors.probe(document);
    expect(snapshot.message.hit).toBe(false);
    expect(selectors.criticalMisses(snapshot)).toEqual(["message"]);
  });
});
