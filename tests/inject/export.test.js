import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import core from "@cwa/export-core";

const FIXED_ISO = "2026-08-18T16:00:00.000Z";
const CONV_ID   = "11111111-2222-4333-8444-555555555555";
const CONV_URL  = `https://chatgpt.com/c/${CONV_ID}`;
const FIXTURE   = readFileSync("tests/fixtures/visible-thread.html", "utf8");

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

function mountFixture() {
  document.body.replaceChildren();
  const wrap = document.createElement("div");
  wrap.insertAdjacentHTML("afterbegin", FIXTURE);
  document.body.appendChild(wrap);
  document.title = "Widget export | ChatGPT";
}

describe("createExporter", () => {
  let downloads;
  let clipboard;
  let fetchImpl;
  let exporter;

  beforeEach(() => {
    mountFixture();
    downloads = [];
    clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    fetchImpl = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("/backend-api/conversation/" + CONV_ID)) {
        return {
          ok    : true,
          status: 200,
          json  : async () => ({
            title  : "Widget export",
            mapping: {
              a: { message: { author: { role: "user" } } },
              b: { message: { author: { role: "assistant" } } },
              c: { message: { author: { role: "assistant" } } },
            },
          }),
        };
      }
      if (href.includes("img-1.png")) {
        return {
          ok    : true,
          status: 200,
          blob  : async () => new Blob(["PNG"], { type: "image/png" }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}), blob: async () => new Blob([]) };
    });
    exporter = core.createExporter({
      window    : window,
      document  : document,
      root      : document,
      location  : { href: CONV_URL, origin: "https://chatgpt.com" },
      fetch     : fetchImpl,
      clipboard : clipboard,
      JSZip     : FakeZip,
      clock     : { now: () => FIXED_ISO },
      download  : (blob, filename) => {
        downloads.push({ blob, filename });
      },
    });
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
  });

  it("falls back to execCommand when clipboard.writeText rejects", async () => {
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    document.execCommand = vi.fn().mockReturnValue(true);

    const result = await exporter.copy();

    expect(result.ok).toBe(true);
    expect(result.method).toBe("execCommand");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("saves markdown with deterministic frontmatter and filename", async () => {
    const result = await exporter.saveMarkdown();

    expect(result.ok).toBe(true);
    expect(result.filename).toBe("cwa-widget-export-2026-08-18.md");
    expect(result.markdown).toContain('exported_at: "2026-08-18T16:00:00.000Z"');
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe(result.filename);
  });

  it("zips chat.md, conversation.json, fetched media, and a gap manifest", async () => {
    const result = await exporter.saveZip();
    const zip    = downloads[0].blob;

    expect(result.ok).toBe(true);
    expect(result.filename).toBe("cwa-widget-export-2026-08-18.zip");
    expect(result.includedJson).toBe(true);
    expect(result.mediaCount).toBe(1);
    expect(result.manifest).toContain("`unloaded_messages`");
    expect(result.manifest).toContain("conversation.json");
    expect(result.markdown).toContain("media/001-plot.png");
    expect(zip).toBeInstanceOf(Blob);

    const conversationFetch = fetchImpl.mock.calls.find(([url]) =>
      String(url).includes("/backend-api/conversation/" + CONV_ID)
    );
    expect(conversationFetch).toBeTruthy();
    expect(conversationFetch[1]).toMatchObject({ credentials: "same-origin" });
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes("/conversations"))).toBe(
      true
    );
  });

  it("omits conversation.json when the same-origin fetch fails", async () => {
    fetchImpl.mockImplementation(async () => {
      throw new Error("offline");
    });
    const failed = core.createExporter({
      window    : window,
      document  : document,
      location  : { href: CONV_URL, origin: "https://chatgpt.com" },
      fetch     : fetchImpl,
      clipboard : clipboard,
      JSZip     : FakeZip,
      clock     : { now: () => FIXED_ISO },
      download  : (blob, filename) => {
        downloads.push({ blob, filename });
      },
    });

    const result = await failed.saveZip();

    expect(result.ok).toBe(true);
    expect(result.includedJson).toBe(false);
    expect(result.manifest).toContain("omitted (network)");
    expect(result.gaps.detected.some((gap) => gap.id === "conversation_json_unavailable")).toBe(
      true
    );
  });

  it("returns jszip_missing without throwing when JSZip is absent", async () => {
    const bare = core.createExporter({
      document : document,
      location : { href: CONV_URL, origin: "https://chatgpt.com" },
      fetch    : fetchImpl,
      JSZip    : undefined,
      clock    : { now: () => FIXED_ISO },
      download : () => {},
    });

    await expect(bare.saveZip()).resolves.toEqual({ ok: false, error: "jszip_missing" });
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
