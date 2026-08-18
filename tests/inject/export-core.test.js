import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import core from "@cwa/export-core";

const FIXED_ISO = "2026-08-18T16:00:00.000Z";
const FIXTURE = readFileSync("tests/fixtures/visible-thread.html", "utf8");

describe("yaml frontmatter", () => {
  it("quotes title, url, and exported_at and escapes quotes", () => {
    const yaml = core.buildFrontmatter({
      title     : 'Say "hello"',
      url       : "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
      exportedAt: FIXED_ISO,
    });

    expect(yaml).toBe(
      [
        "---",
        'title: "Say \\"hello\\""',
        'url: "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555"',
        'exported_at: "2026-08-18T16:00:00.000Z"',
        "---",
        "",
      ].join("\n")
    );
  });
});

describe("serializeThreadToMarkdown", () => {
  const thread = {
    title     : "Widget export",
    url       : "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
    exportedAt: FIXED_ISO,
    messages  : [
      {
        role  : "user",
        id    : "u1",
        blocks: [{ type: "paragraph", text: "Please show a python example" }],
      },
      {
        role  : "assistant",
        id    : "a1",
        blocks: [
          { type: "thinking", text: "Checking libraries" },
          {
            type: "paragraph",
            text: "Here is an example with a [Python docs](https://docs.python.org/3/).",
          },
          { type: "code", language: "python", text: 'print("hi")' },
          {
            type : "citation",
            title: "Python docs",
            url  : "https://docs.python.org/3/",
          },
        ],
      },
    ],
  };

  it("renders user/assistant, code fences, citations, and thinking blockquotes", () => {
    const md = core.serializeThreadToMarkdown(thread, { frontmatter: false });

    expect(md).toContain("## User");
    expect(md).toContain("Please show a python example");
    expect(md).toContain("## Assistant");
    expect(md).toContain("> Checking libraries");
    expect(md).toContain("```python\nprint(\"hi\")\n```");
    expect(md).toContain("### Sources");
    expect(md).toContain("[Python docs](https://docs.python.org/3/)");
    expect(md).toContain("Visible thread only");
    expect(md).toContain("Settings → Data Controls → Export data");
    expect(md).not.toMatch(/^---/m);
  });

  it("prefixes saved markdown with YAML frontmatter", () => {
    const md = core.serializeThreadToMarkdown(thread, { frontmatter: true });

    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain('exported_at: "2026-08-18T16:00:00.000Z"');
    expect(md).toContain('title: "Widget export"');
  });

  it("lengthens fences when the code contains backticks", () => {
    const md = core.serializeMessageToMarkdown({
      role  : "assistant",
      blocks: [{ type: "code", language: "md", text: "use ``` inside" }],
    });

    expect(md).toContain("````md\nuse ``` inside\n````");
  });
});

describe("gap manifest", () => {
  it("always lists inherent visible-thread limitations and the official export path", () => {
    const manifest = core.buildManifestMarkdown({
      title     : "Widget export",
      url       : "https://chatgpt.com/c/abc",
      exportedAt: FIXED_ISO,
      included  : { mediaCount: 0 },
      gaps      : core.detectExportGaps({}),
    });

    expect(manifest).toContain("Visible-thread export manifest");
    expect(manifest).toContain("Settings → Data Controls → Export data");
    expect(manifest).toContain(core.OFFICIAL_EXPORT_HELP);
    expect(manifest).toContain("`unloaded_messages`");
    expect(manifest).toContain("`closed_canvases`");
    expect(manifest).toContain("`deep_research_panels`");
    expect(manifest).toContain("`code_interpreter_files`");
    expect(manifest).toContain("`hidden_thinking`");
    expect(manifest).toContain("observed-ui");
    expect(manifest).not.toContain("conversation.json");
    expect(manifest).not.toContain("includedJson");
  });

  it("marks detected gaps from DOM/media signals without inventing extra harvests", () => {
    const gaps = core.detectExportGaps({
      unloadedMessages    : true,
      closedCanvases      : true,
      deepResearchPanels  : false,
      codeInterpreterFiles: true,
      hiddenThinking      : true,
      mediaFetchFailed    : true,
      mediaSkipped        : true,
    });

    expect(gaps.detected.map((item) => item.id)).toEqual([
      "unloaded_messages",
      "closed_canvases",
      "code_interpreter_files",
      "hidden_thinking",
      "media_fetch_failed",
      "media_skipped",
    ]);
    expect(gaps.inherent).toHaveLength(5);
  });

  it("builds a machine-readable manifest without a conversation JSON file entry", () => {
    const obj = core.buildManifestObject({
      title     : "Widget export",
      url       : "https://chatgpt.com/c/abc",
      exportedAt: FIXED_ISO,
      included  : { mediaCount: 1 },
      mediaFiles: ["media/001-plot.png"],
      gaps      : core.detectExportGaps({}),
    });

    expect(obj.schema).toBe("cwa.export-manifest.v1");
    expect(obj.source.authority).toBe("observed-ui");
    expect(obj.formats).toEqual(["md", "zip"]);
    expect(obj.files).toEqual(["chat.md", "MANIFEST.md", "manifest.json", "media/001-plot.png"]);
    expect(obj.files).not.toContain("conversation.json");
  });
});

describe("url and filename helpers", () => {
  it("parses the current conversation id only", () => {
    expect(
      core.parseConversationIdFromUrl(
        "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555?foo=1"
      )
    ).toBe("11111111-2222-4333-8444-555555555555");
    expect(
      core.parseConversationIdFromUrl("https://chatgpt.com/g/gizmo/c/gizmo-thread")
    ).toBe("gizmo-thread");
    expect(core.parseConversationIdFromUrl("https://chatgpt.com/")).toBeNull();
  });

  it("treats a conversation URL or mounted messages as a supported export route", () => {
    expect(
      core.isSupportedExportRoute(
        "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
        0
      )
    ).toBe(true);
    expect(core.isSupportedExportRoute("https://chatgpt.com/settings", 2)).toBe(true);
    expect(core.isSupportedExportRoute("https://chatgpt.com/settings", 0)).toBe(false);
  });

  it("slugifies a deterministic download stem", () => {
    expect(core.slugifyFilename("Widget export!", FIXED_ISO)).toBe(
      "cwa-widget-export-2026-08-18"
    );
  });

  it("sanitizes media names so they cannot traverse out of media/", () => {
    expect(core.sanitizeMediaFilename(0, "../secret.png", "https://cdn.example/a.png")).toBe(
      "001-secret-png.png"
    );
    expect(core.sanitizeMediaFilename(1, "..\\windows", "https://cdn.example/x.jpg")).toBe(
      "002-windows.jpg"
    );
    expect(core.sanitizeMediaFilename(0, "../secret.png", "https://cdn.example/a.png")).not.toContain(
      ".."
    );
    expect(core.sanitizeMediaFilename(0, "../secret.png", "https://cdn.example/a.png")).not.toContain(
      "/"
    );
  });
});

describe("collectVisibleThread", () => {
  it("serializes a ChatGPT-like fixture without living on chatgpt.com", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML("afterbegin", FIXTURE);
    document.body.appendChild(wrap);
    document.title = "Widget export | ChatGPT";

    const thread = core.collectVisibleThread(document, {
      url       : "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
      exportedAt: FIXED_ISO,
    });

    expect(thread.title).toBe("Widget export");
    expect(thread.messages).toHaveLength(2);
    expect(thread.messages[0].role).toBe("user");
    expect(thread.messages[1].role).toBe("assistant");
    expect(thread.messages[1].blocks.some((block) => block.type === "thinking")).toBe(true);
    expect(thread.messages[1].blocks.some((block) => block.type === "code")).toBe(true);
    expect(thread.messages[1].blocks.some((block) => block.type === "image")).toBe(true);

    const md = core.serializeThreadToMarkdown(thread, { frontmatter: true });
    expect(md).toContain("```python");
    expect(md).toContain("> Checking libraries");
    expect(md).toContain("![plot](https://files.oaiusercontent.com/img-1.png)");
  });

  it("flags known DOM gaps from the fixture without conversation JSON counts", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML("afterbegin", FIXTURE);
    document.body.appendChild(wrap);

    const signals = core.inspectExportSignals(document.body, {
      failedMedia : 1,
      skippedMedia: 1,
    });

    expect(signals.unloadedMessages).toBe(true);
    expect(signals.closedCanvases).toBe(true);
    expect(signals.deepResearchPanels).toBe(true);
    expect(signals.codeInterpreterFiles).toBe(true);
    expect(signals.mediaFetchFailed).toBe(true);
    expect(signals.mediaSkipped).toBe(true);
    expect(signals.conversationJsonMissing).toBeUndefined();
  });
});
