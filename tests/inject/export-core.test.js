import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import core from "@cwa/export-core";

const FIXED_ISO = "2026-08-18T16:00:00.000Z";
const FIXTURE = readFileSync("tests/fixtures/visible-thread.html", "utf8");
const MANIFEST_SCHEMA = JSON.parse(
  readFileSync("schemas/export-manifest.schema.json", "utf8")
);

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

  it("preserves consecutive blank lines inside fenced code blocks", () => {
    const md = core.serializeThreadToMarkdown({
      messages: [{
        role  : "assistant",
        blocks: [{ type: "code", language: "txt", text: "first\n\n\nlast" }],
      }],
    }, { frontmatter: false, notice: false });

    expect(md).toContain("```txt\nfirst\n\n\nlast\n```");
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

  it("does not treat the new-conversation route as a conversation id", () => {
    expect(core.parseConversationIdFromUrl("https://chatgpt.com/c/new")).toBeNull();
    expect(core.parseConversationIdFromUrl("https://chatgpt.com/c/new/")).toBeNull();
    expect(core.isSupportedExportRoute("https://chatgpt.com/c/new", 0)).toBe(false);
    expect(core.isSupportedExportRoute("https://chatgpt.com/c/new", 1)).toBe(true);
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

  it("returns normalized allowlist decisions and specific denial reasons", () => {
    expect(core.mediaUrlDecision("/files/output.csv", "https://chatgpt.com")).toEqual({
      allowed: true,
      href   : "https://chatgpt.com/files/output.csv",
    });
    expect(
      core.mediaUrlDecision("https://files.oaiusercontent.com:443/image.png", "https://chatgpt.com")
    ).toMatchObject({ allowed: true });
    expect(
      core.mediaUrlDecision("https://chatgpt.com:444/image.png", "https://chatgpt.com")
    ).toEqual({
      allowed: false,
      reason : "disallowed_host",
      href   : "https://chatgpt.com:444/image.png",
    });
    expect(
      core.mediaUrlDecision(
        "https://chatgpt.com/%2Fbackend-api%2Fconversation",
        "https://chatgpt.com"
      )
    ).toEqual({
      allowed: false,
      reason : "forbidden_endpoint",
      href   : "https://chatgpt.com/%2Fbackend-api%2Fconversation",
    });
    expect(core.mediaUrlDecision("ftp://chatgpt.com/file", "https://chatgpt.com")).toEqual({
      allowed: false,
      reason : "unsupported_scheme",
    });
    expect(core.mediaUrlDecision("https://", "https://chatgpt.com")).toEqual({
      allowed: false,
      reason : "invalid_url",
    });
    expect(core.mediaUrlDecision("/files/output.csv", "")).toEqual({
      allowed: false,
      reason : "invalid_url",
    });
    expect(
      core.mediaUrlDecision("https://user:secret@chatgpt.com/file", "https://chatgpt.com")
    ).toEqual({ allowed: false, reason: "invalid_url" });
    expect(core.isAllowedMediaUrl("/files/output.csv", "https://chatgpt.com")).toBe(true);
  });
});

describe("export manifest schema", () => {
  it("requires core archive files and closes nested record shapes", () => {
    const filesSchema = MANIFEST_SCHEMA.properties.files;

    expect(MANIFEST_SCHEMA.required).toContain("media");
    expect(MANIFEST_SCHEMA.properties.media.required).toEqual([
      "workflow",
      "included",
      "failed",
      "skipped",
    ]);
    expect(MANIFEST_SCHEMA.properties.media.properties.workflow.enum).toEqual(["visible-dom"]);
    expect(filesSchema.allOf).toEqual([
      { contains: { const: "chat.md" } },
      { contains: { const: "MANIFEST.md" } },
    ]);
    expect(MANIFEST_SCHEMA.properties.limitations.items.additionalProperties).toBe(false);
    expect(MANIFEST_SCHEMA.properties.media.properties.failed.items.additionalProperties).toBe(false);
    expect(MANIFEST_SCHEMA.properties.media.properties.skipped.items.additionalProperties).toBe(false);
  });

  it("rejects the conversation.json basename across separators and case", () => {
    const filePattern = new RegExp(MANIFEST_SCHEMA.properties.files.items.not.pattern);

    expect(filePattern.test("conversation.json")).toBe(true);
    expect(filePattern.test("media/conversation.json")).toBe(true);
    expect(filePattern.test("media\\conversation.json")).toBe(true);
    expect(filePattern.test("Conversation.JSON")).toBe(true);
    expect(filePattern.test("C:\\temp\\conversation.json")).toBe(true);
    expect(filePattern.test("media/conversation.json.txt")).toBe(false);
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

  it("collects only non-hidden messages mounted under main", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<section data-message-author-role="assistant">
        <p>OFF_THREAD_SECRET</p>
      </section>
      <main>
        <div data-message-author-role="user">
          <p>VISIBLE_USER</p>
        </div>
        <div data-message-author-role="assistant">
          <p>VISIBLE_ASSISTANT</p>
        </div>
        <div data-message-author-role="assistant" style="display: none">
          <p>HIDDEN_SECRET</p>
        </div>
        <div data-message-author-role="user" hidden>
          <p>HIDDEN_ATTRIBUTE_SECRET</p>
        </div>
        <div class="cwa-toolbar" data-message-author-role="assistant">
          <p>CHROME_SECRET</p>
        </div>
      </main>`
    );
    document.body.appendChild(wrap);

    const thread = core.collectVisibleThread(document, {
      url       : "https://chatgpt.com/c/11111111-2222-4333-8444-555555555555",
      exportedAt: FIXED_ISO,
    });
    const serialized = JSON.stringify(thread);
    const markdown = core.serializeThreadToMarkdown(thread, { frontmatter: false });

    expect(thread.messages).toHaveLength(2);
    expect(thread.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(serialized).toContain("VISIBLE_USER");
    expect(serialized).toContain("VISIBLE_ASSISTANT");
    expect(serialized).not.toContain("OFF_THREAD_SECRET");
    expect(serialized).not.toContain("HIDDEN_SECRET");
    expect(serialized).not.toContain("HIDDEN_ATTRIBUTE_SECRET");
    expect(serialized).not.toContain("CHROME_SECRET");
    expect(markdown).toContain("VISIBLE_USER");
    expect(markdown).toContain("VISIBLE_ASSISTANT");
    expect(markdown).not.toContain("OFF_THREAD_SECRET");
    expect(markdown).not.toContain("HIDDEN_SECRET");
    expect(markdown).not.toContain("HIDDEN_ATTRIBUTE_SECRET");
    expect(markdown).not.toContain("CHROME_SECRET");
  });

  it("fails closed when the search root has no main", () => {
    document.body.replaceChildren();
    const message = document.createElement("div");
    message.setAttribute("data-message-author-role", "assistant");
    message.textContent = "OFF_THREAD_SECRET";
    document.body.appendChild(message);

    const thread = core.collectVisibleThread(document, {
      exportedAt: FIXED_ISO,
    });

    expect(thread.messages).toEqual([]);
    expect(core.serializeThreadToMarkdown(thread)).not.toContain("OFF_THREAD_SECRET");
  });

  it("omits CSS-hidden descendant text, thinking, and citations inside a visible message", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<main>
        <div data-message-author-role="assistant">
          <p>VISIBLE_TEXT</p>
          <p style="display: none">HIDDEN_BLOCK_SECRET</p>
          <p>keep <span hidden>HIDDEN_INLINE_SECRET</span> going</p>
          <div data-testid="reasoning" style="display: none">HIDDEN_THINKING_SECRET</div>
          <a href="https://docs.python.org/3/" data-testid="citation" hidden>HIDDEN_CITE_SECRET</a>
        </div>
      </main>`
    );
    document.body.appendChild(wrap);

    const thread = core.collectVisibleThread(document, { exportedAt: FIXED_ISO });
    const serialized = JSON.stringify(thread);
    const markdown = core.serializeThreadToMarkdown(thread, { frontmatter: false });

    expect(thread.messages).toHaveLength(1);
    expect(serialized).toContain("VISIBLE_TEXT");
    expect(serialized).not.toContain("HIDDEN_BLOCK_SECRET");
    expect(serialized).not.toContain("HIDDEN_INLINE_SECRET");
    expect(serialized).not.toContain("HIDDEN_THINKING_SECRET");
    expect(serialized).not.toContain("HIDDEN_CITE_SECRET");
    expect(markdown).toContain("VISIBLE_TEXT");
    expect(markdown).not.toContain("HIDDEN_BLOCK_SECRET");
    expect(markdown).not.toContain("HIDDEN_INLINE_SECRET");
    expect(markdown).not.toContain("HIDDEN_THINKING_SECRET");
    expect(markdown).not.toContain("HIDDEN_CITE_SECRET");
  });

  it("omits CSS-hidden text inside thinking, code, citations, tables, and file-card labels", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<main>
        <div data-message-author-role="assistant">
          <div data-testid="reasoning">VISIBLE_THINK <span hidden>HIDDEN_IN_THINK</span></div>
          <pre><code class="language-python">print("ok")<span hidden>HIDDEN_IN_CODE</span></code></pre>
          <p>see <code>keep<span hidden>HIDDEN_INLINE_CODE</span></code></p>
          <a href="https://docs.python.org/3/" data-testid="citation">Python<span hidden>HIDDEN_IN_CITE</span></a>
          <table>
            <tr><th>keep</th><th hidden>HIDDEN_TH</th></tr>
            <tr><td>visible</td><td style="display: none">HIDDEN_TD</td></tr>
          </table>
        </div>
        <a href="/files/abc">report<span hidden>HIDDEN_FILE_LABEL</span>.csv</a>
      </main>`
    );
    document.body.appendChild(wrap);

    const thread = core.collectVisibleThread(document, { exportedAt: FIXED_ISO });
    const serialized = JSON.stringify(thread);
    const markdown = core.serializeThreadToMarkdown(thread, { frontmatter: false });
    const cards = core.collectVisibleFileCards(document);
    const code = thread.messages[0].blocks.find((block) => block.type === "code");

    expect(serialized).toContain("VISIBLE_THINK");
    expect(code && code.text).toBe('print("ok")');
    expect(serialized).not.toContain("HIDDEN_IN_THINK");
    expect(serialized).not.toContain("HIDDEN_IN_CODE");
    expect(serialized).not.toContain("HIDDEN_INLINE_CODE");
    expect(serialized).not.toContain("HIDDEN_IN_CITE");
    expect(serialized).not.toContain("HIDDEN_TH");
    expect(serialized).not.toContain("HIDDEN_TD");
    expect(markdown).not.toContain("HIDDEN_IN_THINK");
    expect(markdown).not.toContain("HIDDEN_IN_CODE");
    expect(markdown).not.toContain("HIDDEN_INLINE_CODE");
    expect(markdown).not.toContain("HIDDEN_IN_CITE");
    expect(markdown).not.toContain("HIDDEN_TH");
    expect(markdown).not.toContain("HIDDEN_TD");
    expect(cards.map((card) => card.alt)).toEqual(["report.csv"]);
  });

  it("walks the whole message when no data-message-content root exists", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<main>
        <div data-message-author-role="assistant">
          <div class="markdown"><p>FIRST_MARKDOWN</p></div>
          <div class="whitespace-pre-wrap">SIBLING_VISIBLE</div>
          <img src="https://files.oaiusercontent.com/img-2.png" alt="extra">
        </div>
      </main>`
    );
    document.body.appendChild(wrap);

    const thread = core.collectVisibleThread(document, { exportedAt: FIXED_ISO });
    const serialized = JSON.stringify(thread);

    expect(thread.messages).toHaveLength(1);
    expect(serialized).toContain("FIRST_MARKDOWN");
    expect(serialized).toContain("SIBLING_VISIBLE");
    expect(serialized).toContain("https://files.oaiusercontent.com/img-2.png");
  });

  it("does not duplicate nested author-role markers as extra turns", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<main>
        <div data-message-author-role="assistant">
          <p>OUTER_VISIBLE</p>
          <div data-message-author-role="assistant">
            <p>INNER_VISIBLE</p>
          </div>
        </div>
      </main>`
    );
    document.body.appendChild(wrap);

    const thread = core.collectVisibleThread(document, { exportedAt: FIXED_ISO });
    const serialized = JSON.stringify(thread);

    expect(thread.messages).toHaveLength(1);
    expect(serialized).toContain("OUTER_VISIBLE");
    expect(serialized).toContain("INNER_VISIBLE");
  });

  it("skips system and tool roles", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML(
      "afterbegin",
      `<main>
        <div data-message-author-role="system"><p>SYSTEM_SECRET</p></div>
        <div data-message-author-role="tool"><p>TOOL_SECRET</p></div>
        <div data-message-author-role="user"><p>VISIBLE_USER</p></div>
      </main>`
    );
    document.body.appendChild(wrap);

    const thread = core.collectVisibleThread(document, { exportedAt: FIXED_ISO });
    const serialized = JSON.stringify(thread);

    expect(thread.messages.map((message) => message.role)).toEqual(["user"]);
    expect(serialized).toContain("VISIBLE_USER");
    expect(serialized).not.toContain("SYSTEM_SECRET");
    expect(serialized).not.toContain("TOOL_SECRET");
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

  it("scopes export-gap inspection to main", () => {
    document.body.replaceChildren();
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<button data-testid="scroll-to-previous">Earlier messages</button>
       <button>Canvas</button>
       <span>Deep research</span>
       <a download href="/files/outside.csv">outside</a>
       <main><p>no conversation gaps here</p></main>`
    );

    const signals = core.inspectExportSignals(document.body);

    expect(signals.unloadedMessages).toBe(false);
    expect(signals.closedCanvases).toBe(false);
    expect(signals.deepResearchPanels).toBe(false);
    expect(signals.codeInterpreterFiles).toBe(false);
  });

  it("ignores nav and toolbar decoys while collecting the main file-card", () => {
    document.body.replaceChildren();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML("afterbegin", FIXTURE);
    document.body.appendChild(wrap);

    const cards = core.collectVisibleFileCards(document);

    expect(cards).toEqual([
      { url: "/files/abc", alt: "output.csv", kind: "file-card" },
    ]);
  });

  it("returns no file cards when the root has no main", () => {
    document.body.replaceChildren();
    const link = document.createElement("a");
    link.href = "/files/outside.csv";
    link.download = "outside.csv";
    document.body.appendChild(link);

    expect(core.collectVisibleFileCards(document)).toEqual([]);
  });

  it("records the policy reason when a mounted file card is denied", () => {
    document.body.replaceChildren();
    const main = document.createElement("main");
    const link = document.createElement("a");
    const skipped = [];
    link.setAttribute("download", "hostile.csv");
    link.setAttribute("href", "https://attacker.example/hostile.csv");
    main.appendChild(link);
    document.body.appendChild(main);

    expect(core.collectVisibleFileCards(main, "https://chatgpt.com", skipped)).toEqual([]);
    expect(skipped).toEqual([
      {
        url   : "https://attacker.example/hostile.csv",
        reason: "disallowed_host",
      },
    ]);
  });

  it("finds a file-card anchor whose data-testid is on the anchor itself", () => {
    document.body.replaceChildren();
    const main = document.createElement("main");
    const link = document.createElement("a");
    link.setAttribute("data-testid", "file-card");
    link.setAttribute("href", "/downloads/report.csv");
    link.textContent = "report.csv";
    main.appendChild(link);
    document.body.appendChild(main);

    expect(core.collectVisibleFileCards(main)).toEqual([
      { url: "/downloads/report.csv", alt: "report.csv", kind: "file-card" },
    ]);
  });

  it.each([
    ["hidden attribute", (node) => node.setAttribute("hidden", "")],
    ["display none", (node) => { node.style.display = "none"; }],
    ["hidden visibility", (node) => { node.style.visibility = "hidden"; }],
    ["collapsed visibility", (node) => { node.style.visibility = "collapse"; }],
    ["zero opacity", (node) => { node.style.opacity = "0"; }],
  ])("omits file cards under an ancestor with %s", (_label, hide) => {
    document.body.replaceChildren();
    const main = document.createElement("main");
    const ancestor = document.createElement("section");
    const link = document.createElement("a");
    hide(ancestor);
    link.setAttribute("data-testid", "file-card");
    link.setAttribute("href", "/files/hidden.csv");
    link.textContent = "hidden.csv";
    ancestor.appendChild(link);
    main.appendChild(ancestor);
    document.body.appendChild(main);

    expect(core.collectVisibleFileCards(main)).toEqual([]);
  });

  it("omits a file card that is itself CSS-hidden", () => {
    document.body.replaceChildren();
    const main = document.createElement("main");
    const link = document.createElement("a");
    link.setAttribute("data-testid", "file-card");
    link.setAttribute("href", "/files/self-hidden.csv");
    link.setAttribute("hidden", "");
    link.textContent = "self-hidden.csv";
    main.appendChild(link);
    document.body.appendChild(main);

    expect(core.collectVisibleFileCards(main)).toEqual([]);
  });

  it("keeps mounted file cards regardless of viewport geometry", () => {
    document.body.replaceChildren();
    const main = document.createElement("main");
    const link = document.createElement("a");
    const bounds = vi.fn(() => ({
      bottom: 0,
      height: 0,
      left  : 0,
      right : 0,
      top   : 0,
      width : 0,
    }));
    link.setAttribute("data-testid", "file-card");
    link.setAttribute("href", "/files/mounted.csv");
    link.textContent = "mounted.csv";
    link.getBoundingClientRect = bounds;
    main.appendChild(link);
    document.body.appendChild(main);

    expect(core.collectVisibleFileCards(main)).toEqual([
      { url: "/files/mounted.csv", alt: "mounted.csv", kind: "file-card" },
    ]);
    expect(bounds).not.toHaveBeenCalled();
  });
});
