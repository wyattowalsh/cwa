/**
 * cwa visible-thread export — pure helpers + DOM serializer.
 *
 * Injected as a classic script (no import/export). Attaches
 * `globalThis.CwaExportCore` for inject/export.js and for tests.
 *
 * Honest product: serialize what is mounted in the current conversation
 * pane. Do not harvest other threads or accounts.
 *
 * No innerHTML assignment, no eval.
 */
(function (global) {
  "use strict";

  var ELEMENT_NODE = 1;
  var TEXT_NODE    = 3;

  var OFFICIAL_EXPORT_HELP =
    "https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data";

  var VISIBLE_THREAD_NOTICE = [
    "> **Visible thread only.** This is not a full ChatGPT account archive.",
    "> Use ChatGPT Settings → Data Controls → Export data for the official export.",
    "> " + OFFICIAL_EXPORT_HELP,
  ].join("\n");

  var INHERENT_GAPS = [
    {
      id    : "unloaded_messages",
      title : "Unloaded messages",
      detail: "Older turns may be virtualized or not mounted; this snapshot only includes nodes in the DOM.",
    },
    {
      id    : "closed_canvases",
      title : "Closed canvases",
      detail: "Canvas / text-doc surfaces that are not open are not scraped.",
    },
    {
      id    : "deep_research_panels",
      title : "Deep Research panels",
      detail: "Deep Research side panels and unmounted report chrome are omitted.",
    },
    {
      id    : "code_interpreter_files",
      title : "Code Interpreter files",
      detail: "CI / file-card downloads are included only when a same-origin fetch of the blob succeeds.",
    },
    {
      id    : "hidden_thinking",
      title : "Hidden thinking",
      detail: "Reasoning is exported only when the thinking block is visible in the DOM.",
    },
  ];

  var GAP_INDEX = {};
  for (var gi = 0; gi < INHERENT_GAPS.length; gi += 1) {
    GAP_INDEX[INHERENT_GAPS[gi].id] = INHERENT_GAPS[gi];
  }
  GAP_INDEX.conversation_json_unavailable = {
    id    : "conversation_json_unavailable",
    title : "conversation.json unavailable",
    detail: "Same-origin fetch of the current conversation JSON failed or was skipped.",
  };
  GAP_INDEX.media_fetch_failed = {
    id    : "media_fetch_failed",
    title : "Media fetch failed",
    detail: "One or more image/file URLs could not be fetched as blobs.",
  };

  var LANGUAGE_RE = /^[A-Za-z0-9_+-]+$/;
  var UUID_RE     = /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  var CONV_ID_RE  = /\/c\/([A-Za-z0-9_-]+)/;

  function yamlDoubleQuoted(value) {
    var s = value == null ? "" : String(value);
    return (
      '"' +
      s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r") +
      '"'
    );
  }

  function buildFrontmatter(meta) {
    meta = meta || {};
    return [
      "---",
      "title: " + yamlDoubleQuoted(meta.title || ""),
      "url: " + yamlDoubleQuoted(meta.url || ""),
      "exported_at: " + yamlDoubleQuoted(meta.exportedAt || ""),
      "---",
      "",
    ].join("\n");
  }

  function headingForRole(role) {
    if (role === "user")      return "User";
    if (role === "assistant") return "Assistant";
    if (role === "system")    return "System";
    if (role === "tool")      return "Tool";
    return role ? String(role) : "Message";
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function codeFence(code, language) {
    var body = String(code == null ? "" : code).replace(/\n$/, "");
    var ticks = "```";
    while (body.indexOf(ticks) !== -1) {
      ticks += "`";
    }
    var lang = LANGUAGE_RE.test(language || "") ? language : "";
    return ticks + lang + "\n" + body + "\n" + ticks;
  }

  function toBlockquote(text) {
    var body = cleanText(text);
    if (!body) {
      return ">";
    }
    return body
      .split("\n")
      .map(function (line) {
        return "> " + line;
      })
      .join("\n");
  }

  function serializeMessageToMarkdown(message) {
    message = message || {};
    var lines     = ["## " + headingForRole(message.role), ""];
    var blocks    = message.blocks || [];
    var citations = [];
    var i;
    var block;

    for (i = 0; i < blocks.length; i += 1) {
      block = blocks[i] || {};
      if (block.type === "thinking") {
        lines.push(toBlockquote(block.text));
        lines.push("");
      } else if (block.type === "code") {
        lines.push(codeFence(block.text || "", block.language || ""));
        lines.push("");
      } else if (block.type === "image") {
        lines.push(
          "![" +
            String(block.alt || "image").replace(/]/g, "\\]") +
            "](" +
            String(block.url || "") +
            ")"
        );
        lines.push("");
      } else if (block.type === "citation") {
        citations.push(block);
      } else if (block.type === "table" || block.type === "list") {
        if (block.markdown) {
          lines.push(block.markdown);
          lines.push("");
        }
      } else if (block.text) {
        lines.push(block.text);
        lines.push("");
      }
    }

    if (citations.length) {
      lines.push("### Sources");
      lines.push("");
      for (i = 0; i < citations.length; i += 1) {
        lines.push(
          String(i + 1) +
            ". [" +
            (citations[i].title || citations[i].text || "source") +
            "](" +
            (citations[i].url || "") +
            ")"
        );
      }
      lines.push("");
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function serializeThreadToMarkdown(thread, options) {
    thread  = thread || {};
    options = options || {};
    var parts    = [];
    var messages = thread.messages || [];
    var i;

    if (options.frontmatter) {
      parts.push(
        buildFrontmatter({
          title     : thread.title,
          url       : thread.url,
          exportedAt: thread.exportedAt,
        })
      );
    }
    if (options.notice !== false) {
      parts.push(VISIBLE_THREAD_NOTICE);
      parts.push("");
    }
    if (thread.title) {
      parts.push("# " + String(thread.title).replace(/\n/g, " ").trim());
      parts.push("");
    }
    for (i = 0; i < messages.length; i += 1) {
      if (i > 0) {
        parts.push("");
      }
      parts.push(serializeMessageToMarkdown(messages[i]));
    }
    return (parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n");
  }

  function detectExportGaps(signals) {
    signals = signals || {};
    var detected = [];

    function add(id) {
      var meta = GAP_INDEX[id];
      if (meta) {
        detected.push({
          id      : meta.id,
          title   : meta.title,
          detail  : meta.detail,
          detected: true,
        });
      }
    }

    if (signals.unloadedMessages)          add("unloaded_messages");
    if (signals.closedCanvases)            add("closed_canvases");
    if (signals.deepResearchPanels)        add("deep_research_panels");
    if (signals.codeInterpreterFiles)      add("code_interpreter_files");
    if (signals.hiddenThinking)            add("hidden_thinking");
    if (signals.conversationJsonMissing)   add("conversation_json_unavailable");
    if (signals.mediaFetchFailed)          add("media_fetch_failed");

    return {
      detected: detected,
      inherent: INHERENT_GAPS.slice(),
    };
  }

  function yamlBullet(item) {
    return "- **" + item.title + "** (`" + item.id + "`): " + item.detail;
  }

  function buildManifestMarkdown(input) {
    input = input || {};
    var included = input.included || {};
    var gaps     = input.gaps || detectExportGaps({});
    var mediaN   = included.mediaCount == null ? 0 : included.mediaCount;
    var jsonLine = included.conversationJson
      ? "- `conversation.json` — same-origin fetch of the **current** conversation succeeded"
      : "- `conversation.json` — omitted (" +
        (input.conversationFetchError || "not fetched") +
        ")";
    var detectedBlock = (gaps.detected && gaps.detected.length)
      ? gaps.detected.map(yamlBullet).join("\n")
      : "- None flagged for this snapshot (inherent limitations below still apply).";
    var inherentBlock = (gaps.inherent || INHERENT_GAPS).map(yamlBullet).join("\n");

    return [
      "# Visible-thread export manifest",
      "",
      "This archive is a **partial snapshot of the currently visible chat**, not an exhaustive dump of your ChatGPT account.",
      "",
      "For a full account archive, use **ChatGPT → Settings → Data Controls → Export data**.",
      OFFICIAL_EXPORT_HELP,
      "",
      "## Snapshot",
      "- title: " + (input.title || ""),
      "- url: " + (input.url || ""),
      "- exported_at: " + (input.exportedAt || ""),
      "",
      "## Included",
      "- `chat.md` — visible user/assistant turns (and visible thinking as blockquotes)",
      jsonLine,
      "- `media/` — " + String(mediaN) + " file(s) fetched as blobs",
      "",
      "## Detected gaps",
      detectedBlock,
      "",
      "## Known limitations (always apply)",
      inherentBlock,
      "",
    ].join("\n");
  }

  function parseConversationIdFromUrl(href) {
    if (!href) {
      return null;
    }
    var path = String(href);
    try {
      if (/^https?:/i.test(path) || path.indexOf("://") !== -1) {
        path = new URL(path).pathname;
      }
    } catch (err) {
      return null;
    }
    var uuid = path.match(UUID_RE);
    if (uuid) {
      return uuid[1];
    }
    var loose = path.match(CONV_ID_RE);
    return loose ? loose[1] : null;
  }

  function conversationRequestUrl(origin, conversationId) {
    var base = String(origin || "").replace(/\/$/, "");
    return base + "/backend-api/conversation/" + encodeURIComponent(conversationId);
  }

  function slugifyFilename(title, exportedAt) {
    var date = String(exportedAt || "").slice(0, 10) || "export";
    var slug = String(title || "chat")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    if (!slug) {
      slug = "chat";
    }
    return "cwa-" + slug + "-" + date;
  }

  function countConversationJsonMessages(data) {
    if (!data || typeof data !== "object" || !data.mapping || typeof data.mapping !== "object") {
      return 0;
    }
    var keys = Object.keys(data.mapping);
    var n    = 0;
    var i;
    var msg;
    var role;
    for (i = 0; i < keys.length; i += 1) {
      msg  = data.mapping[keys[i]] && data.mapping[keys[i]].message;
      role = msg && msg.author && msg.author.role;
      if (role === "user" || role === "assistant") {
        n += 1;
      }
    }
    return n;
  }

  function conversationTitle(doc) {
    var raw = "";
    if (doc && typeof doc.title === "string") {
      raw = doc.title.trim();
    }
    raw = raw.replace(/\s*[|—–-]\s*ChatGPT\s*$/i, "").trim();
    if (raw && !/^chatgpt$/i.test(raw)) {
      return raw;
    }
    var heading = doc && doc.querySelector && doc.querySelector("h1");
    if (heading && cleanText(heading.textContent)) {
      return cleanText(heading.textContent);
    }
    return "Untitled conversation";
  }

  function isIgnoredChrome(el) {
    var testid = String(el.getAttribute("data-testid") || "").toLowerCase();
    if (/^(copy-|good-response|bad-response|regenerate|edit-message)/.test(testid)) {
      return true;
    }
    if (el.getAttribute("data-cwa-chrome") != null) {
      return true;
    }
    return false;
  }

  function isThinking(el) {
    var testid = String(el.getAttribute("data-testid") || "").toLowerCase();
    if (/reason|thought|thinking/.test(testid)) {
      return true;
    }
    return el.getAttribute("data-cwa") === "thinking";
  }

  function isCodeBlock(el) {
    var tag    = el.tagName;
    var testid = String(el.getAttribute("data-testid") || "").toLowerCase();
    if (tag === "PRE" || tag === "CODE-BLOCK") {
      return true;
    }
    if (testid === "code-block" || testid.indexOf("code-block") !== -1) {
      return true;
    }
    if (el.classList && el.classList.contains("cm-editor")) {
      return true;
    }
    return false;
  }

  function extractCodeBlock(el) {
    var lang   = el.getAttribute("data-language") || "";
    var codeEl = el.tagName === "CODE" ? el : el.querySelector("code");
    var cm     = el.querySelector(".cm-content, .cm-line") && el.querySelector(".cm-content");
    var text;
    var className;
    var match;
    if (codeEl) {
      className = String(codeEl.className || "");
      match     = className.match(/language-([A-Za-z0-9_+-]+)/);
      if (match) {
        lang = match[1];
      }
      if (codeEl.getAttribute("data-language")) {
        lang = codeEl.getAttribute("data-language");
      }
    }
    if (cm) {
      text = cm.textContent;
    } else {
      text = (codeEl || el).textContent;
    }
    return {
      type    : "code",
      language: lang,
      text    : String(text || "").replace(/\n$/, ""),
    };
  }

  function extractImage(el) {
    var src = el.getAttribute("src") || el.getAttribute("data-src") || "";
    if (!src || /^data:image\/svg/i.test(src)) {
      return null;
    }
    return {
      type: "image",
      url : src,
      alt : el.getAttribute("alt") || "image",
    };
  }

  function isCitationAnchor(el, href) {
    var testid = String(el.getAttribute("data-testid") || "").toLowerCase();
    if (testid.indexOf("citation") !== -1 || testid.indexOf("footnote") !== -1) {
      return true;
    }
    if (el.getAttribute("data-cite") != null) {
      return true;
    }
    return /cite|footnote/i.test(href || "");
  }

  function inlineMarkdown(el) {
    var out   = "";
    var nodes = el.childNodes || [];
    var i;
    var child;
    var tag;
    var href;
    var inner;
    for (i = 0; i < nodes.length; i += 1) {
      child = nodes[i];
      if (child.nodeType === TEXT_NODE) {
        out += child.nodeValue || "";
      } else if (child.nodeType === ELEMENT_NODE) {
        tag = child.tagName;
        if (tag === "BR") {
          out += "\n";
        } else if (tag === "CODE" && child.parentElement && child.parentElement.tagName !== "PRE") {
          out += "`" + String(child.textContent || "").replace(/`/g, "\\`") + "`";
        } else if (tag === "STRONG" || tag === "B") {
          out += "**" + inlineMarkdown(child) + "**";
        } else if (tag === "EM" || tag === "I") {
          out += "*" + inlineMarkdown(child) + "*";
        } else if (tag === "A") {
          href  = child.getAttribute("href") || "";
          inner = cleanText(inlineMarkdown(child)) || href;
          out += href ? "[" + inner + "](" + href + ")" : inner;
        } else if (tag === "IMG") {
          /* images become sibling blocks in walkBlocks */
        } else {
          out += inlineMarkdown(child);
        }
      }
    }
    return out;
  }

  function listToMarkdown(el) {
    var ordered = el.tagName === "OL";
    var items   = el.querySelectorAll ? el.querySelectorAll(":scope > li") : [];
    var lines   = [];
    var i;
    var prefix;
    if (!items.length && el.children) {
      items = [];
      for (i = 0; i < el.children.length; i += 1) {
        if (el.children[i].tagName === "LI") {
          items.push(el.children[i]);
        }
      }
    }
    for (i = 0; i < items.length; i += 1) {
      prefix = ordered ? String(i + 1) + ". " : "- ";
      lines.push(prefix + inlineMarkdown(items[i]).trim());
    }
    return lines.join("\n");
  }

  function tableToMarkdown(table) {
    var trs  = table.querySelectorAll("tr");
    var rows = [];
    var i;
    var j;
    var cells;
    var cols;
    for (i = 0; i < trs.length; i += 1) {
      cells = trs[i].querySelectorAll("th, td");
      cols  = [];
      for (j = 0; j < cells.length; j += 1) {
        cols.push(inlineMarkdown(cells[j]).trim().replace(/\|/g, "\\|"));
      }
      if (cols.length) {
        rows.push(cols);
      }
    }
    if (!rows.length) {
      return "";
    }
    var header = rows[0];
    var out    = [];
    var sep    = [];
    out.push("| " + header.join(" | ") + " |");
    for (i = 0; i < header.length; i += 1) {
      sep.push("---");
    }
    out.push("| " + sep.join(" | ") + " |");
    for (i = 1; i < rows.length; i += 1) {
      out.push("| " + rows[i].join(" | ") + " |");
    }
    return out.join("\n");
  }

  function walkBlocks(el, blocks) {
    var tag;
    var text;
    var img;
    var i;
    var imgs;
    var children;
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return;
    }
    if (isIgnoredChrome(el)) {
      return;
    }
    tag = el.tagName;
    if (tag === "BUTTON" || tag === "NAV" || tag === "FORM") {
      return;
    }
    if (isThinking(el)) {
      blocks.push({ type: "thinking", text: cleanText(el.textContent) });
      return;
    }
    if (isCodeBlock(el)) {
      blocks.push(extractCodeBlock(el));
      return;
    }
    if (tag === "TABLE") {
      text = tableToMarkdown(el);
      if (text) {
        blocks.push({ type: "table", markdown: text });
      }
      return;
    }
    if (tag === "UL" || tag === "OL") {
      text = listToMarkdown(el);
      if (text) {
        blocks.push({ type: "list", markdown: text });
      }
      return;
    }
    if (tag === "IMG") {
      img = extractImage(el);
      if (img) {
        blocks.push(img);
      }
      return;
    }
    if (tag === "HR") {
      blocks.push({ type: "paragraph", text: "---" });
      return;
    }
    if (/^H[1-6]$/.test(tag)) {
      text = inlineMarkdown(el).trim();
      if (text) {
        blocks.push({
          type: "paragraph",
          text: "######".slice(0, Number(tag.charAt(1))) + " " + text,
        });
      }
      return;
    }
    if (tag === "A" && isCitationAnchor(el, el.getAttribute("href") || "")) {
      blocks.push({
        type : "citation",
        title: cleanText(el.textContent) || "source",
        url  : el.getAttribute("href") || "",
      });
      return;
    }
    if (tag === "P" || tag === "LI" || tag === "FIGCAPTION" || tag === "BLOCKQUOTE") {
      text = inlineMarkdown(el).trim();
      if (text) {
        blocks.push({ type: "paragraph", text: text });
      }
      imgs = el.querySelectorAll("img");
      for (i = 0; i < imgs.length; i += 1) {
        img = extractImage(imgs[i]);
        if (img) {
          blocks.push(img);
        }
      }
      return;
    }
    children = el.children;
    if (!children || children.length === 0) {
      text = el.classList && el.classList.contains("whitespace-pre-wrap")
        ? String(el.textContent || "").replace(/^\n+|\n+$/g, "")
        : cleanText(el.textContent);
      if (text) {
        blocks.push({ type: "paragraph", text: text });
      }
      return;
    }
    for (i = 0; i < children.length; i += 1) {
      walkBlocks(children[i], blocks);
    }
  }

  function blocksFromContentRoot(root) {
    var blocks = [];
    if (!root) {
      return blocks;
    }
    walkBlocks(root, blocks);
    return blocks;
  }

  function collectCitationBlocks(messageNode) {
    var nodes = messageNode.querySelectorAll(
      '[data-testid*="citation"], [data-testid*="footnote"], [data-cite], a[href*="cite"]'
    );
    var out = [];
    var i;
    var el;
    var href;
    for (i = 0; i < nodes.length; i += 1) {
      el   = nodes[i];
      href = el.getAttribute("href") || "";
      if (el.tagName === "A" || href) {
        out.push({
          type : "citation",
          title: cleanText(el.textContent) || "source",
          url  : href,
        });
      }
    }
    return out;
  }

  function messageFromNode(node) {
    var roleEl  = node.hasAttribute("data-message-author-role")
      ? node
      : node.querySelector("[data-message-author-role]");
    var role    = (roleEl && roleEl.getAttribute("data-message-author-role")) || "assistant";
    var id      = node.getAttribute("data-message-id") ||
      (roleEl && roleEl.getAttribute("data-message-id")) ||
      "";
    var content = node.querySelector("[data-message-content]") ||
      node.querySelector(".markdown, .prose, .whitespace-pre-wrap") ||
      node;
    var blocks  = blocksFromContentRoot(content);
    var thinkingNodes = node.querySelectorAll(
      '[data-testid="reasoning"], [data-testid="thinking"], [data-cwa="thinking"]'
    );
    var seenThinking = false;
    var i;
    var extra;
    var citations;
    for (i = 0; i < blocks.length; i += 1) {
      if (blocks[i].type === "thinking") {
        seenThinking = true;
        break;
      }
    }
    if (!seenThinking) {
      extra = [];
      for (i = 0; i < thinkingNodes.length; i += 1) {
        if (content.contains && content.contains(thinkingNodes[i])) {
          continue;
        }
        extra.push({ type: "thinking", text: cleanText(thinkingNodes[i].textContent) });
      }
      if (extra.length) {
        blocks = extra.concat(blocks);
      }
    }
    citations = collectCitationBlocks(node);
    for (i = 0; i < citations.length; i += 1) {
      blocks.push(citations[i]);
    }
    return {
      role  : role,
      id    : id,
      blocks: blocks,
    };
  }

  function collectVisibleThread(root, options) {
    options = options || {};
    var doc = root && root.nodeType === 9 ? root : (root && root.ownerDocument) || root;
    var searchRoot = root && root.nodeType === 9
      ? (root.body || root.documentElement || root)
      : (root || doc);
    var href = options.url || (options.location && options.location.href) || "";
    var title = options.title || conversationTitle(doc);
    var exportedAt = options.exportedAt ||
      (options.clock && options.clock.now && options.clock.now()) ||
      new Date().toISOString();
    var nodes = searchRoot.querySelectorAll
      ? Array.prototype.slice.call(searchRoot.querySelectorAll("[data-message-author-role]"))
      : [];
    var messages = [];
    var i;
    var msg;
    if (nodes.length === 0 && searchRoot.querySelectorAll) {
      nodes = Array.prototype.slice.call(
        searchRoot.querySelectorAll('article[data-testid^="conversation-turn-"]')
      );
    }
    for (i = 0; i < nodes.length; i += 1) {
      msg = messageFromNode(nodes[i]);
      if (msg && msg.blocks && msg.blocks.length) {
        messages.push(msg);
      }
    }
    return {
      title     : title,
      url       : href,
      exportedAt: exportedAt,
      messages  : messages,
    };
  }

  function textMatches(el, pattern) {
    return pattern.test(String(el.textContent || "").trim()) ||
      pattern.test(String(el.getAttribute("aria-label") || ""));
  }

  function findThoughtButton(msg) {
    var buttons = msg.querySelectorAll("button");
    var i;
    for (i = 0; i < buttons.length; i += 1) {
      if (textMatches(buttons[i], /^(thought|thinking|reasoned|show thought)/i) ||
          /thought|thinking|reasoning/i.test(buttons[i].getAttribute("aria-label") || "")) {
        return buttons[i];
      }
    }
    return null;
  }

  function hasClosedCanvas(root) {
    if (root.querySelector('[data-cwa-canvas="closed"]')) {
      return true;
    }
    var open = root.querySelector(
      '[data-testid="canvas-panel"], [data-cwa-canvas="open"]'
    );
    if (open) {
      return false;
    }
    if (root.querySelector('[data-testid*="canvas"], [data-testid*="textdoc"]')) {
      return true;
    }
    var labeled = root.querySelectorAll("[aria-label]");
    var i;
    var buttons;
    for (i = 0; i < labeled.length; i += 1) {
      if (/canvas/i.test(labeled[i].getAttribute("aria-label") || "")) {
        return true;
      }
    }
    buttons = root.querySelectorAll("button");
    for (i = 0; i < buttons.length; i += 1) {
      if (textMatches(buttons[i], /^(canvas|open canvas)$/i)) {
        return true;
      }
    }
    return false;
  }

  function hasDeepResearchGap(root) {
    if (root.querySelector('[data-cwa-dr="closed"]')) {
      return true;
    }
    var panel = root.querySelector(
      '[data-testid*="deep-research"], [data-cwa-dr="open"]'
    );
    if (panel) {
      return false;
    }
    var hints = root.querySelectorAll("button, a, span");
    var i;
    for (i = 0; i < hints.length; i += 1) {
      if (/deep research/i.test(String(hints[i].textContent || "").trim())) {
        return true;
      }
    }
    return false;
  }

  function hasHiddenThinking(root) {
    var messages = root.querySelectorAll("[data-message-author-role]");
    var i;
    var msg;
    var btn;
    var thinking;
    for (i = 0; i < messages.length; i += 1) {
      msg      = messages[i];
      btn      = findThoughtButton(msg);
      thinking = msg.querySelector(
        '[data-testid="reasoning"], [data-testid="thinking"], [data-cwa="thinking"]'
      );
      if (btn && (!thinking || !cleanText(thinking.textContent))) {
        return true;
      }
    }
    return false;
  }

  function hasUnfetchedFiles(root) {
    return Boolean(
      root.querySelector(
        "a[download], a[href*='/files/'], [data-testid*='file-card'], [data-testid*='attachment']"
      )
    );
  }

  function inspectExportSignals(root, extras) {
    extras = extras || {};
    var jsonCount = extras.jsonMessageCount || 0;
    var domCount  = extras.domMessageCount || 0;
    var unloaded  = jsonCount > 0 && jsonCount > domCount;
    if (root && root.querySelector &&
        root.querySelector('[data-testid="scroll-to-previous"], [data-testid="conversation-scroll-up"]')) {
      unloaded = true;
    }
    return {
      unloadedMessages       : Boolean(unloaded),
      closedCanvases         : root ? hasClosedCanvas(root) : false,
      deepResearchPanels     : root ? hasDeepResearchGap(root) : false,
      codeInterpreterFiles   : root ? hasUnfetchedFiles(root) : false,
      hiddenThinking         : root ? hasHiddenThinking(root) : false,
      conversationJsonMissing: !extras.conversationJson,
      mediaFetchFailed       : (extras.failedMedia || 0) > 0,
    };
  }

  function isFetchableUrl(url) {
    return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url);
  }

  function collectMediaFromMessages(messages) {
    var out = [];
    var i;
    var j;
    var blocks;
    var block;
    for (i = 0; i < (messages || []).length; i += 1) {
      blocks = messages[i].blocks || [];
      for (j = 0; j < blocks.length; j += 1) {
        block = blocks[j];
        if (block.type === "image" && block.url && !/^data:/i.test(block.url)) {
          out.push({ url: block.url, alt: block.alt || "image" });
        }
      }
    }
    return out;
  }

  function collectMediaFromConversationJson(data) {
    var out = [];
    var keys;
    var i;
    var j;
    var node;
    var msg;
    var parts;
    var part;
    var atts;
    var att;
    if (!data || !data.mapping) {
      return out;
    }
    keys = Object.keys(data.mapping);
    for (i = 0; i < keys.length; i += 1) {
      node  = data.mapping[keys[i]];
      msg   = node && node.message;
      parts = msg && msg.content && msg.content.parts;
      if (parts) {
        for (j = 0; j < parts.length; j += 1) {
          part = parts[j];
          if (part && typeof part === "object") {
            if (typeof part.asset_pointer === "string" && isFetchableUrl(part.asset_pointer)) {
              out.push({ url: part.asset_pointer, alt: "asset" });
            }
            if (typeof part.image_url === "string") {
              out.push({ url: part.image_url, alt: "image" });
            }
          }
        }
      }
      atts = msg && msg.metadata && msg.metadata.attachments;
      if (atts) {
        for (j = 0; j < atts.length; j += 1) {
          att = atts[j];
          if (att && att.url) {
            out.push({ url: att.url, alt: att.name || "attachment" });
          }
        }
      }
    }
    return out;
  }

  function extensionFromNameOrType(url, mime) {
    var match = String(url).match(/\.(png|jpe?g|gif|webp|svg|pdf|txt|csv|json|md|zip)(?:\?|$)/i);
    if (match) {
      return "." + match[1].toLowerCase().replace("jpeg", "jpg");
    }
    mime = String(mime || "");
    if (/png/i.test(mime))  return ".png";
    if (/jpe?g/i.test(mime)) return ".jpg";
    if (/gif/i.test(mime))  return ".gif";
    if (/webp/i.test(mime)) return ".webp";
    if (/pdf/i.test(mime))  return ".pdf";
    return ".bin";
  }

  function safeMediaBase(alt) {
    var slug = String(alt || "file")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    return slug || "file";
  }

  function rewriteThreadMedia(thread, rewrites) {
    rewrites = rewrites || {};
    return {
      title     : thread.title,
      url       : thread.url,
      exportedAt: thread.exportedAt,
      messages  : (thread.messages || []).map(function (message) {
        return {
          role  : message.role,
          id    : message.id,
          blocks: (message.blocks || []).map(function (block) {
            if (block.type === "image" && block.url && rewrites[block.url]) {
              return { type: "image", url: rewrites[block.url], alt: block.alt };
            }
            return block;
          }),
        };
      }),
    };
  }

  async function copyText(text, options) {
    options = options || {};
    var clipboard = options.clipboard;
    var doc       = options.document;
    var ta;
    var ok;
    if (clipboard && typeof clipboard.writeText === "function") {
      try {
        await clipboard.writeText(text);
        return { ok: true, method: "clipboard-api" };
      } catch (err) {
        /* fall through to execCommand */
      }
    }
    if (!doc || !doc.body) {
      return { ok: false, method: "unavailable" };
    }
    ta = doc.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.position = "fixed";
    ta.style.left     = "-9999px";
    ta.style.top      = "0";
    doc.body.appendChild(ta);
    ta.focus();
    ta.select();
    ok = false;
    try {
      ok = typeof doc.execCommand === "function" ? doc.execCommand("copy") : false;
    } catch (err) {
      ok = false;
    }
    if (ta.parentNode) {
      ta.parentNode.removeChild(ta);
    }
    return { ok: Boolean(ok), method: "execCommand" };
  }

  function triggerDownload(blob, filename, doc) {
    var url;
    var anchor;
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc || !doc.body || typeof URL === "undefined" || !URL.createObjectURL) {
      return false;
    }
    url    = URL.createObjectURL(blob);
    anchor = doc.createElement("a");
    anchor.href     = url;
    anchor.download = filename;
    anchor.rel      = "noopener";
    anchor.style.display = "none";
    doc.body.appendChild(anchor);
    anchor.click();
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
    return true;
  }

  function emitStatus(deps, detail) {
    var win = deps && deps.window;
    var Ev;
    if (!win || typeof win.dispatchEvent !== "function") {
      return;
    }
    Ev = win.CustomEvent || (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!Ev) {
      return;
    }
    win.dispatchEvent(new Ev("cwa:export-status", { detail: detail }));
  }

  async function readSameOriginAccessToken(fetchImpl, origin) {
    var res;
    var data;
    try {
      res = await fetchImpl(String(origin || "").replace(/\/$/, "") + "/api/auth/session", {
        credentials: "same-origin",
        headers    : { Accept: "application/json" },
      });
      if (!res || !res.ok) {
        return null;
      }
      data = await res.json();
      return data && typeof data.accessToken === "string" ? data.accessToken : null;
    } catch (err) {
      return null;
    }
  }

  async function fetchCurrentConversationJson(fetchImpl, origin, conversationId) {
    var url = conversationRequestUrl(origin, conversationId);
    var res;
    var token;
    try {
      res = await fetchImpl(url, {
        method     : "GET",
        credentials: "same-origin",
        headers    : { Accept: "application/json" },
      });
      if (res && res.ok) {
        return { ok: true, data: await res.json() };
      }
      if (res && (res.status === 401 || res.status === 403)) {
        token = await readSameOriginAccessToken(fetchImpl, origin);
        if (token) {
          res = await fetchImpl(url, {
            method     : "GET",
            credentials: "same-origin",
            headers    : {
              Accept       : "application/json",
              Authorization: "Bearer " + token,
            },
          });
          if (res && res.ok) {
            return { ok: true, data: await res.json() };
          }
        }
      }
      return { ok: false, reason: "http_" + (res && res.status ? res.status : "0") };
    } catch (err) {
      return { ok: false, reason: "network" };
    }
  }

  async function collectAndFetchMedia(thread, json, fetchImpl) {
    var candidates = collectMediaFromMessages(thread.messages)
      .concat(collectMediaFromConversationJson(json));
    var seen  = {};
    var list  = [];
    var i;
    var item;
    var url;
    var files       = [];
    var rewrites    = {};
    var fetchedUrls = [];
    var failed      = 0;
    var res;
    var content;
    var ext;
    var name;

    function add(entry) {
      var href = entry && entry.url;
      if (!href || seen[href] || !isFetchableUrl(href)) {
        return;
      }
      seen[href] = true;
      list.push(entry);
    }

    for (i = 0; i < candidates.length; i += 1) {
      add(candidates[i]);
    }
    if (list.length > 40) {
      list = list.slice(0, 40);
    }
    if (!fetchImpl) {
      return { files: files, rewrites: rewrites, failed: 0, fetchedUrls: fetchedUrls };
    }
    for (i = 0; i < list.length; i += 1) {
      item = list[i];
      url  = item.url;
      try {
        res = await fetchImpl(url, { credentials: "include" });
        if (!res || !res.ok) {
          failed += 1;
          continue;
        }
        content = await res.blob();
        ext     = extensionFromNameOrType(url, content && content.type);
        name    = String(i + 1).padStart(3, "0") + "-" + safeMediaBase(item.alt || "image") + ext;
        files.push({ name: name, content: content, url: url });
        rewrites[url] = "media/" + name;
        fetchedUrls.push(url);
      } catch (err) {
        failed += 1;
      }
    }
    return { files: files, rewrites: rewrites, failed: failed, fetchedUrls: fetchedUrls };
  }

  function createExporter(deps) {
    deps = deps || {};
    var doc        = deps.document;
    var loc        = deps.location || { href: "", origin: "" };
    var fetchImpl  = deps.fetch;
    var clipboard  = deps.clipboard;
    var JSZipImpl  = deps.JSZip;
    var clock      = deps.clock || { now: function () { return new Date().toISOString(); } };
    var download   = deps.download || triggerDownload;
    var root       = deps.root || doc;

    function snapshot(extra) {
      extra = extra || {};
      return collectVisibleThread(root, {
        url       : loc.href,
        exportedAt: extra.exportedAt || clock.now(),
        clock     : clock,
        location  : loc,
      });
    }

    async function copy() {
      var thread = snapshot();
      var md     = serializeThreadToMarkdown(thread, { frontmatter: false });
      var result = await copyText(md, { clipboard: clipboard, document: doc });
      emitStatus(deps, { action: "copy", ok: result.ok, method: result.method });
      return { ok: result.ok, markdown: md, method: result.method };
    }

    async function saveMarkdown() {
      var thread = snapshot();
      var md     = serializeThreadToMarkdown(thread, { frontmatter: true });
      var name   = slugifyFilename(thread.title, thread.exportedAt) + ".md";
      var blob   = new Blob([md], { type: "text/markdown;charset=utf-8" });
      download(blob, name, doc);
      emitStatus(deps, { action: "save-md", ok: true, filename: name });
      return { ok: true, filename: name, markdown: md };
    }

    async function saveZip() {
      var thread;
      var convId;
      var jsonResult;
      var media;
      var jsonCount;
      var signals;
      var gaps;
      var chatMd;
      var manifest;
      var zip;
      var blob;
      var name;
      var i;
      if (typeof JSZipImpl !== "function") {
        emitStatus(deps, { action: "save-zip", ok: false, message: "JSZip is not loaded" });
        return { ok: false, error: "jszip_missing" };
      }
      thread     = snapshot();
      convId     = parseConversationIdFromUrl(loc.href);
      jsonResult = { ok: false, reason: "skipped" };
      if (convId && fetchImpl) {
        jsonResult = await fetchCurrentConversationJson(fetchImpl, loc.origin, convId);
      } else if (!convId) {
        jsonResult = { ok: false, reason: "no_conversation_id" };
      } else {
        jsonResult = { ok: false, reason: "no_fetch" };
      }
      media     = await collectAndFetchMedia(thread, jsonResult.data, fetchImpl);
      jsonCount = countConversationJsonMessages(jsonResult.data);
      signals   = inspectExportSignals(root, {
        jsonMessageCount : jsonCount,
        domMessageCount  : thread.messages.length,
        conversationJson : jsonResult.ok ? jsonResult.data : null,
        failedMedia      : media.failed,
        fetchedFileUrls  : media.fetchedUrls,
      });
      if (!jsonResult.ok) {
        signals.conversationJsonMissing = true;
      }
      gaps     = detectExportGaps(signals);
      chatMd   = serializeThreadToMarkdown(rewriteThreadMedia(thread, media.rewrites), {
        frontmatter: true,
      });
      manifest = buildManifestMarkdown({
        title                 : thread.title,
        url                   : loc.href,
        exportedAt            : thread.exportedAt,
        included              : {
          chatMd          : true,
          conversationJson: jsonResult.ok,
          mediaCount      : media.files.length,
        },
        gaps                  : gaps,
        conversationFetchError: jsonResult.ok ? null : jsonResult.reason,
      });
      zip = new JSZipImpl();
      zip.file("chat.md", chatMd);
      zip.file("MANIFEST.md", manifest);
      if (jsonResult.ok) {
        zip.file("conversation.json", JSON.stringify(jsonResult.data, null, 2));
      }
      for (i = 0; i < media.files.length; i += 1) {
        zip.file("media/" + media.files[i].name, media.files[i].content);
      }
      blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      name = slugifyFilename(thread.title, thread.exportedAt) + ".zip";
      download(blob, name, doc);
      emitStatus(deps, { action: "save-zip", ok: true, filename: name });
      return {
        ok         : true,
        filename   : name,
        gaps       : gaps,
        includedJson: jsonResult.ok,
        mediaCount : media.files.length,
        manifest   : manifest,
        markdown   : chatMd,
      };
    }

    return {
      copy        : copy,
      saveMarkdown: saveMarkdown,
      saveZip     : saveZip,
      snapshot    : snapshot,
    };
  }

  var api = {
    OFFICIAL_EXPORT_HELP            : OFFICIAL_EXPORT_HELP,
    VISIBLE_THREAD_NOTICE           : VISIBLE_THREAD_NOTICE,
    INHERENT_GAPS                   : INHERENT_GAPS,
    yamlDoubleQuoted                : yamlDoubleQuoted,
    buildFrontmatter                : buildFrontmatter,
    serializeMessageToMarkdown      : serializeMessageToMarkdown,
    serializeThreadToMarkdown       : serializeThreadToMarkdown,
    detectExportGaps                : detectExportGaps,
    buildManifestMarkdown           : buildManifestMarkdown,
    parseConversationIdFromUrl      : parseConversationIdFromUrl,
    conversationRequestUrl          : conversationRequestUrl,
    slugifyFilename                 : slugifyFilename,
    countConversationJsonMessages   : countConversationJsonMessages,
    collectVisibleThread            : collectVisibleThread,
    inspectExportSignals            : inspectExportSignals,
    collectMediaFromMessages        : collectMediaFromMessages,
    collectMediaFromConversationJson: collectMediaFromConversationJson,
    rewriteThreadMedia              : rewriteThreadMedia,
    copyText                        : copyText,
    triggerDownload                 : triggerDownload,
    createExporter                  : createExporter,
    fetchCurrentConversationJson    : fetchCurrentConversationJson,
  };

  global.CwaExportCore = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
