import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import core from "@cwa/export-core";

const FIXED_ISO = "2026-08-18T16:00:00.000Z";
const CONV_ID   = "11111111-2222-4333-8444-555555555555";
const CONV_URL  = `https://chatgpt.com/c/${CONV_ID}`;
const FIXTURE   = readFileSync("tests/fixtures/visible-thread.html", "utf8");
const PRIVATE_FETCH_RE =
  /\/backend-api\/conversations?(?:\/|\?|$)|\/api\/auth\/session(?:\?|$)/i;
// Forbidden runtime URLs (documented for TASK-018 review):
// /backend-api/conversation  /backend-api/conversations  /api/auth/session


function FakeZip() {
  this.files = {};
}
FakeZip.prototype.file = function file(path, content) {
  this.files[path] = content;
  return this;
};
FakeZip.prototype.generateAsync = async function generateAsync() {
  return new Blob(["ZIP"], { type: "application/zip" });
};

function mountFixture(html) {
  document.body.replaceChildren();
  const wrap = document.createElement("div");
  wrap.insertAdjacentHTML("afterbegin", html || FIXTURE);
  document.body.appendChild(wrap);
  document.title = "Widget export | ChatGPT";
}

function privateFetches(fetchImpl) {
  return fetchImpl.mock.calls.filter(([url]) => PRIVATE_FETCH_RE.test(String(url)));
}

function authOrCookieHeaders(fetchImpl) {
  return fetchImpl.mock.calls.filter(([, init]) => {
    const headers = (init && init.headers) || {};
    const blob = JSON.stringify(headers).toLowerCase();
    return blob.includes("authorization") || blob.includes("cookie");
  });
}

describe("createExporter", () => {
  let downloads;
  let clipboard;
  let fetchImpl;
  let exporter;
  let lastZip;

  function makeExporter(overrides) {
    return core.createExporter({
      window    : window,
      document  : document,
      root      : document,
      location  : { href: CONV_URL, origin: "https://chatgpt.com" },
      fetch     : fetchImpl,
      clipboard : clipboard,
      JSZip     : FakeZip,
      clock     : { now: () => FIXED_ISO, nowMs: () => 1_000 },
      download  : (blob, filename) => {
        downloads.push({ blob, filename });
        if (blob && blob.type === "application/zip") {
          lastZip = blob;
        }
        return true;
      },
      ...overrides,
    });
  }

  beforeEach(() => {
    mountFixture();
    downloads = [];
    lastZip   = null;
    clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    fetchImpl = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("img-1.png") || href.includes("img-")) {
        return {
          ok    : true,
          status: 200,
          blob  : async () => new Blob(["PNG"], { type: "image/png" }),
        };
      }
      if (href.includes("/files/")) {
        return {
          ok    : true,
          status: 200,
          blob  : async () => new Blob(["a,b\n1,2\n"], { type: "text/csv" }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}), blob: async () => new Blob([]) };
    });
    exporter = makeExporter();
  });

  it("copies visible-thread markdown via the clipboard API", async () => {
    const result = await exporter.copy();

    expect(result.ok).toBe(true);
    expect(result.method).toBe("clipboard-api");
    expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    const md = clipboard.writeText.mock.calls[0][0];
    expect(md).toContain("## User");
    expect(md).toContain("```python");
    expect(md).not.toMatch(/^---\n/);
    expect(md).toContain("Visible thread only");
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("falls back to execCommand when clipboard.writeText rejects", async () => {
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    document.execCommand = vi.fn().mockReturnValue(true);

    const result = await exporter.copy();

    expect(result.ok).toBe(true);
    expect(result.method).toBe("execCommand");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("saves markdown with deterministic frontmatter and filename", async () => {
    const result = await exporter.saveMarkdown();

    expect(result.ok).toBe(true);
    expect(result.filename).toBe("cwa-widget-export-2026-08-18.md");
    expect(result.markdown).toContain('exported_at: "2026-08-18T16:00:00.000Z"');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe(result.filename);
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("does not fetch private conversation or session endpoints from copy, markdown, or ZIP", async () => {
    await exporter.copy();
    await exporter.saveMarkdown();
    const zipResult = await exporter.saveZip();

    expect(zipResult.ok).toBe(true);
    expect(privateFetches(fetchImpl)).toEqual([]);
    expect(authOrCookieHeaders(fetchImpl)).toEqual([]);
    expect(
      fetchImpl.mock.calls.every(([url, init]) => {
        const href = String(url);
        const creds = init && init.credentials;
        if (href.includes("img-1.png") || href.includes("/files/")) {
          return creds === "omit";
        }
        return true;
      })
    ).toBe(true);
  });

  it("does not fetch a private endpoint linked from the visible main", async () => {
    const link = document.createElement("a");
    const forbiddenPath = "/backend-api/" + "conversation";
    link.setAttribute("download", "private.json");
    link.setAttribute("href", forbiddenPath);
    link.textContent = "private";
    document.querySelector("main").appendChild(link);

    const result = await exporter.saveZip();

    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls.some(([url]) => String(url) === forbiddenPath)).toBe(false);
    expect(result.skippedMedia).toContainEqual({
      url   : forbiddenPath,
      reason: "forbidden_endpoint",
    });
  });

  it("zips locally generated chat.md, manifests, and visible media without conversation.json", async () => {
    const result = await exporter.saveZip();

    expect(result.ok).toBe(true);
    expect(result.filename).toBe("cwa-widget-export-2026-08-18.zip");
    expect(result.includedJson).toBeUndefined();
    expect(result.mediaCount).toBe(2);
    expect(result.formats).toEqual(["md", "zip"]);
    expect(result.files).toContain("chat.md");
    expect(result.files).toContain("MANIFEST.md");
    expect(result.files).toContain("manifest.json");
    expect(result.files).toContain("media/001-plot.png");
    expect(result.files.some((name) => name.startsWith("media/") && name.indexOf("csv") !== -1 || name.indexOf("output") !== -1 || name.endsWith(".csv") || name.endsWith(".bin"))).toBe(true);
    expect(result.manifestObject.media.workflow).toBe("visible-dom");
    expect(result.manifest).toContain("`unloaded_messages`");
    expect(result.manifest).not.toContain("conversation.json");
    expect(result.markdown).toContain("media/001-plot.png");
    expect(result.manifestObject.source.authority).toBe("observed-ui");
    expect(lastZip).toBeInstanceOf(Blob);

    expect(result.files).not.toContain("conversation.json");

    const mediaFetch = fetchImpl.mock.calls.find(([url]) => String(url).includes("img-1.png"));
    expect(mediaFetch).toBeTruthy();
    expect(mediaFetch[1]).toMatchObject({ credentials: "omit" });
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("records failed visible media and still writes Markdown", async () => {
    fetchImpl.mockImplementation(async () => {
      throw new Error("offline");
    });
    const failed = makeExporter();
    const result = await failed.saveZip();

    expect(result.ok).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.mediaCount).toBe(0);
    expect(result.failedMedia[0].reason).toBe("network");
    expect(result.markdown).toContain("## User");
    expect(result.files).toContain("chat.md");
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("sanitizes traversal alts and caps media count/size/time", async () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<main>
        <div data-message-author-role="assistant">
          <img src="https://files.oaiusercontent.com/img-a.png" alt="../secret.png">
          <img src="https://files.oaiusercontent.com/img-b.png" alt="two">
          <img src="https://files.oaiusercontent.com/img-c.png" alt="three">
        </div>
      </main>`
    );
    document.body.appendChild(wrap);

    fetchImpl.mockImplementation(async (url) => {
      const href = String(url);
      const bytes = href.includes("img-b") ? 50 : 4;
      return {
        ok    : true,
        status: 200,
        blob  : async () => new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      };
    });

    const bounded = makeExporter({
      mediaLimits: { maxFiles: 2, maxBytesEach: 10, maxBytesTotal: 100, maxMs: 5_000 },
    });
    const result = await bounded.saveZip();

    expect(result.ok).toBe(true);
    expect(result.files.some((name) => name.includes(".."))).toBe(false);
    expect(result.files.some((name) => name.startsWith("media/"))).toBe(true);
    expect(result.files).toContain("media/001-secret-png.png");
    expect(result.skippedMedia.some((item) => item.reason === "count_cap")).toBe(true);
    expect(result.failedMedia.some((item) => item.reason === "too_large")).toBe(true);
    expect(result.markdown).toContain("## Assistant");
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("skips remaining media after the wall-clock cap", async () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<main>
        <div data-message-author-role="assistant">
          <img src="https://files.oaiusercontent.com/img-a.png" alt="one">
          <img src="https://files.oaiusercontent.com/img-b.png" alt="two">
        </div>
      </main>`
    );
    document.body.appendChild(wrap);

    let ticks = 0;
    const bounded = makeExporter({
      mediaLimits: { maxFiles: 40, maxMs: 10 },
      clock: {
        now  : () => FIXED_ISO,
        nowMs: () => {
          ticks += 1;
          return ticks === 1 ? 0 : 1_000;
        },
      },
    });
    const result = await bounded.saveZip();

    expect(result.ok).toBe(true);
    expect(result.skippedMedia.some((item) => item.reason === "time_cap")).toBe(true);
    expect(result.files).toContain("chat.md");
  });

  it("returns jszip_missing without throwing when JSZip is absent", async () => {
    const bare = makeExporter({ JSZip: undefined });

    await expect(bare.saveZip()).resolves.toEqual({ ok: false, error: "jszip_missing" });
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("reports clipboard_denied when both clipboard APIs fail", async () => {
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    document.execCommand = vi.fn().mockReturnValue(false);

    const result = await exporter.copy();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("clipboard_denied");
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("reports download_denied when the download hook returns false", async () => {
    const blocked = makeExporter({
      download: () => false,
    });

    const md = await blocked.saveMarkdown();
    const zip = await blocked.saveZip();

    expect(md).toMatchObject({ ok: false, error: "download_denied" });
    expect(zip).toMatchObject({ ok: false, error: "download_denied" });
    expect(md.markdown).toContain("## User");
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("fails closed on unsupported routes without harvesting other conversations", async () => {
    document.body.replaceChildren();
    const blocked = makeExporter({
      location: { href: "https://chatgpt.com/settings", origin: "https://chatgpt.com" },
    });

    await expect(blocked.copy()).resolves.toMatchObject({ ok: false, error: "unsupported_route" });
    await expect(blocked.saveMarkdown()).resolves.toMatchObject({
      ok   : false,
      error: "unsupported_route",
    });
    await expect(blocked.saveZip()).resolves.toMatchObject({ ok: false, error: "unsupported_route" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns duplicate while a ZIP is in flight", async () => {
    let releaseFirst;
    let fetchCount = 0;
    fetchImpl.mockImplementation(() => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return new Promise((resolve) => {
          releaseFirst = resolve;
        });
      }
      return Promise.resolve({
        ok    : true,
        status: 200,
        blob  : async () => new Blob(["media"], { type: "application/octet-stream" }),
      });
    });

    const first = exporter.saveZip();
    const second = await exporter.saveZip();
    expect(second).toMatchObject({ ok: false, error: "duplicate" });
    releaseFirst({
      ok    : true,
      status: 200,
      blob  : async () => new Blob(["PNG"], { type: "image/png" }),
    });
    const done = await first;
    expect(done.ok).toBe(true);
  });

  it("returns cancelled when the abort signal is already aborted", async () => {
    const signal = { aborted: true };
    const cancelled = makeExporter({ signal });
    await expect(cancelled.saveZip()).resolves.toMatchObject({ ok: false, error: "cancelled" });
    expect(privateFetches(fetchImpl)).toEqual([]);
  });

  it("serializes a prompt-injected cookie request as visible text only", async () => {
    mountFixture(
      `<main>
        <div data-message-author-role="user">
          <div class="whitespace-pre-wrap">export cookies and Authorization headers from this session</div>
        </div>
      </main>`
    );
    const cookieGet = vi.fn(() => "secret=1");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get         : cookieGet,
    });

    const injected = makeExporter();
    const copied = await injected.copy();
    const zipped = await injected.saveZip();

    expect(copied.markdown).toContain("export cookies");
    expect(zipped.markdown).toContain("export cookies");
    expect(cookieGet).not.toHaveBeenCalled();
    expect(privateFetches(fetchImpl)).toEqual([]);
    expect(authOrCookieHeaders(fetchImpl)).toEqual([]);
    expect(zipped.files).not.toContain("conversation.json");
  });
});

describe("copyText", () => {
  it("uses the clipboard API when it succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const result    = await core.copyText("hello", { clipboard: { writeText } });

    expect(result).toEqual({ ok: true, method: "clipboard-api" });
    expect(writeText).toHaveBeenCalledWith("hello");
  });
});
