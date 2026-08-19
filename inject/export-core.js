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
  GAP_INDEX.media_fetch_failed = {
    id    : "media_fetch_failed",
    title : "Media fetch failed",
    detail: "One or more visible image/file URLs could not be fetched as blobs.",
  };
  GAP_INDEX.media_skipped = {
    id    : "media_skipped",
    title : "Media skipped",
    detail: "Some visible media were omitted because of count, size, or time caps.",
  };

  var MEDIA_MAX_FILES       = 40;
  var MEDIA_MAX_BYTES_EACH  = 8 * 1024 * 1024;
  var MEDIA_MAX_BYTES_TOTAL = 25 * 1024 * 1024;
  var MEDIA_MAX_MS          = 8000;

  var LANGUAGE_RE = /^[A-Za-z0-9_+-]+$/;
  var UUID_RE     = /\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  var CONV_ID_RE  = /\/c\/([A-Za-z0-9_-]+)/;
  var SKIP_EXPORT_TAGS = {
    SCRIPT  : true,
    STYLE   : true,
    NOSCRIPT: true,
    TEMPLATE: true,
    SELECT  : true,
    OPTION  : true,
  };
  var BLOCK_BREAK_TAGS = {
    ADDRESS   : true,
    ARTICLE   : true,
    ASIDE     : true,
    BLOCKQUOTE: true,
    DETAILS   : true,
    DIALOG    : true,
    DIV       : true,
    DL        : true,
    DT        : true,
    DD        : true,
    FIELDSET  : true,
    FIGCAPTION: true,
    FIGURE    : true,
    FOOTER    : true,
    FORM      : true,
    H1        : true,
    H2        : true,
    H3        : true,
    H4        : true,
    H5        : true,
    H6        : true,
    HEADER    : true,
    HR        : true,
    LI        : true,
    MAIN      : true,
    NAV       : true,
    OL        : true,
    P         : true,
    PRE       : true,
    SECTION   : true,
    TABLE     : true,
    TBODY     : true,
    TD        : true,
    TFOOT     : true,
    TH        : true,
    THEAD     : true,
    TR        : true,
    UL        : true,
    SUMMARY   : true,
  };

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

  function collapseBlankLinesOutsideFences(value) {
    var lines = String(value == null ? "" : value).split("\n");
    var out = [];
    var fenceChar = "";
    var fenceLength = 0;
    var blankOutside = false;
    var i;
    var line;
    var marker;
    var closing;
    for (i = 0; i < lines.length; i += 1) {
      line = lines[i];
      if (fenceChar) {
        out.push(line);
        closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
        if (closing &&
            closing[1].charAt(0) === fenceChar &&
            closing[1].length >= fenceLength) {
          fenceChar = "";
          fenceLength = 0;
          blankOutside = false;
        }
        continue;
      }
      if (/^[ \t]*$/.test(line)) {
        if (!blankOutside) {
          out.push(line);
        }
        blankOutside = true;
        continue;
      }
      out.push(line);
      blankOutside = false;
      marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (marker) {
        fenceChar = marker[1].charAt(0);
        fenceLength = marker[1].length;
      }
    }
    return out.join("\n");
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

    return collapseBlankLinesOutsideFences(lines.join("\n")).trim();
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
    return (collapseBlankLinesOutsideFences(parts.join("\n")).trim() + "\n");
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
    if (signals.mediaFetchFailed)          add("media_fetch_failed");
    if (signals.mediaSkipped)              add("media_skipped");

    return {
      detected: detected,
      inherent: INHERENT_GAPS.slice(),
    };
  }

  function yamlBullet(item) {
    return "- **" + item.title + "** (`" + item.id + "`): " + item.detail;
  }

  function mediaListBlock(items) {
    if (!items || !items.length) {
      return "- None";
    }
    return items.map(function (item) {
      return "- `" + (item.url || "") + "` — " + (item.reason || "failed");
    }).join("\n");
  }

  function buildManifestMarkdown(input) {
    input = input || {};
    var included = input.included || {};
    var gaps     = input.gaps || detectExportGaps({});
    var mediaN   = included.mediaCount == null ? 0 : included.mediaCount;
    var detectedBlock = (gaps.detected && gaps.detected.length)
      ? gaps.detected.map(yamlBullet).join("\n")
      : "- None flagged for this snapshot (inherent limitations below still apply).";
    var inherentBlock = (gaps.inherent || INHERENT_GAPS).map(yamlBullet).join("\n");

    return [
      "# Visible-thread export manifest",
      "",
      "This archive is a **partial snapshot of the currently visible chat**, not an exhaustive dump of your ChatGPT account.",
      "",
      "Authority: `observed-ui` / `local-cwa`. Private provider conversation JSON is not fetched or stored.",
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
      "- `manifest.json` — machine-readable provenance for this snapshot",
      "- `media/` — " + String(mediaN) + " visible file(s) fetched as blobs (`credentials: omit`)",
      "",
      "## Media failures",
      mediaListBlock(input.failedMedia),
      "",
      "## Media skipped (caps)",
      mediaListBlock(input.skippedMedia),
      "",
      "## Detected gaps",
      detectedBlock,
      "",
      "## Known limitations (always apply)",
      inherentBlock,
      "",
    ].join("\n");
  }

  function buildManifestObject(input) {
    input = input || {};
    var included = input.included || {};
    var gaps     = input.gaps || detectExportGaps({});
    var files    = ["chat.md", "MANIFEST.md", "manifest.json"].concat(input.mediaFiles || []);
    var seen     = {};
    var limitations = [];
    function addLimitation(item, detected) {
      if (!item || seen[item.id]) {
        return;
      }
      seen[item.id] = true;
      limitations.push({
        id      : item.id,
        title   : item.title,
        detail  : item.detail,
        detected: Boolean(detected),
      });
    }
    (gaps.inherent || INHERENT_GAPS).forEach(function (item) {
      var flagged = (gaps.detected || []).some(function (hit) {
        return hit.id === item.id;
      });
      addLimitation(item, flagged);
    });
    (gaps.detected || []).forEach(function (item) {
      addLimitation(item, true);
    });
    return {
      schema     : "cwa.export-manifest.v1",
      product    : "cwa",
      source     : {
        authority: "observed-ui",
        url      : input.url || "",
        title    : input.title || "",
      },
      exportedAt : input.exportedAt || "",
      formats    : ["md", "zip"],
      files      : files,
      limitations: limitations,
      media      : {
        included: included.mediaCount == null ? 0 : included.mediaCount,
        failed  : input.failedMedia || [],
        skipped : input.skippedMedia || [],
        workflow: "visible-dom",
      },
      officialExport: OFFICIAL_EXPORT_HELP,
    };
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
    path = path.split(/[?#]/)[0];
    if (/\/c\/new\/?$/i.test(path)) {
      return null;
    }
    var uuid = path.match(UUID_RE);
    if (uuid) {
      return uuid[1];
    }
    var loose = path.match(CONV_ID_RE);
    return loose ? loose[1] : null;
  }

  function isSupportedExportRoute(href, messageCount) {
    if ((messageCount || 0) > 0) {
      return true;
    }
    return Boolean(parseConversationIdFromUrl(href));
  }

  function sameExportRoute(left, right) {
    var idLeft  = parseConversationIdFromUrl(left);
    var idRight = parseConversationIdFromUrl(right);
    if (idLeft || idRight) {
      return idLeft === idRight;
    }
    return String(left || "") === String(right || "");
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

  function conversationTitle(doc) {
    var raw = "";
    var pane;
    var headings;
    var i;
    var heading;
    var text;
    if (doc && typeof doc.title === "string") {
      raw = doc.title.trim();
    }
    raw = raw.replace(/\s*[|—–-]\s*ChatGPT\s*$/i, "").trim();
    if (raw && !/^chatgpt$/i.test(raw)) {
      return raw;
    }
    pane = findConversationMain(doc);
    headings = pane && pane.querySelectorAll ? pane.querySelectorAll("h1") : [];
    for (i = 0; i < headings.length; i += 1) {
      heading = headings[i];
      if (hasCssHiddenAncestor(heading)) {
        continue;
      }
      text = cleanText(visibleText(heading));
      if (text) {
        return text;
      }
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
      text = visibleText(cm);
    } else {
      text = visibleText(codeEl || el);
    }
    return {
      type    : "code",
      language: lang,
      text    : String(text || "").replace(/\n$/, ""),
    };
  }

  function extractImage(el) {
    if (hasCssHiddenAncestor(el)) {
      return null;
    }
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
        if (hasCssHiddenAncestor(child)) {
          continue;
        }
        tag = child.tagName;
        if (tag === "BR") {
          out += "\n";
        } else if (tag === "CODE" && child.parentElement && child.parentElement.tagName !== "PRE") {
          out += "`" + String(visibleText(child) || "").replace(/`/g, "\\`") + "`";
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
        } else if (tag === "UL" || tag === "OL") {
          /* nested lists are rendered by listToMarkdown */
        } else {
          out += inlineMarkdown(child);
        }
      }
    }
    return out;
  }

  function listToMarkdown(el, indent) {
    var ordered = el.tagName === "OL";
    var items   = el.querySelectorAll ? el.querySelectorAll(":scope > li") : [];
    var lines   = [];
    var i;
    var j;
    var n;
    var prefix;
    var item;
    var nested;
    var kids;
    var child;
    var line;
    indent = indent || "";
    if (!items.length && el.children) {
      items = [];
      for (i = 0; i < el.children.length; i += 1) {
        if (el.children[i].tagName === "LI") {
          items.push(el.children[i]);
        }
      }
    }
    n = 0;
    for (i = 0; i < items.length; i += 1) {
      item = items[i];
      if (hasCssHiddenAncestor(item)) {
        continue;
      }
      n += 1;
      prefix = ordered ? String(n) + ". " : "- ";
      nested = [];
      kids = item.children || [];
      for (j = 0; j < kids.length; j += 1) {
        child = kids[j];
        if ((child.tagName === "UL" || child.tagName === "OL") && !hasCssHiddenAncestor(child)) {
          nested.push(listToMarkdown(child, indent + "  "));
        }
      }
      line = indent + prefix + inlineMarkdown(item).trim();
      lines.push(line);
      for (j = 0; j < nested.length; j += 1) {
        if (nested[j]) {
          lines.push(nested[j]);
        }
      }
    }
    return lines.join("\n");
  }

  function tableSectionRows(table) {
    var rows = [];
    var i;
    var collection;
    if (table && table.rows && table.rows.length != null) {
      for (i = 0; i < table.rows.length; i += 1) {
        rows.push(table.rows[i]);
      }
      return rows;
    }
    try {
      collection = table.querySelectorAll(
        ":scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr"
      );
    } catch (_err) {
      collection = table.querySelectorAll("tr");
    }
    for (i = 0; i < collection.length; i += 1) {
      rows.push(collection[i]);
    }
    return rows;
  }

  function tableRowCells(tr) {
    var cells = [];
    var kids;
    var i;
    var tag;
    kids = tr.children || [];
    for (i = 0; i < kids.length; i += 1) {
      tag = kids[i].tagName;
      if (tag === "TH" || tag === "TD") {
        cells.push(kids[i]);
      }
    }
    if (cells.length) {
      return cells;
    }
    return tr.querySelectorAll ? Array.prototype.slice.call(tr.querySelectorAll("th, td")) : [];
  }

  function tableToMarkdown(table) {
    var trs  = tableSectionRows(table);
    var rows = [];
    var i;
    var j;
    var cells;
    var cols;
    var hiddenCols = {};
    var width = 0;
    var kept;
    for (i = 0; i < trs.length; i += 1) {
      if (hasCssHiddenAncestor(trs[i])) {
        continue;
      }
      cells = tableRowCells(trs[i]);
      cols  = [];
      for (j = 0; j < cells.length; j += 1) {
        if (hasCssHiddenAncestor(cells[j])) {
          hiddenCols[j] = true;
          cols.push(null);
          continue;
        }
        cols.push(inlineMarkdown(cells[j]).trim().replace(/\|/g, "\\|"));
      }
      if (cols.length) {
        rows.push(cols);
        if (cols.length > width) {
          width = cols.length;
        }
      }
    }
    if (!rows.length) {
      return "";
    }
    kept = [];
    for (j = 0; j < width; j += 1) {
      if (!hiddenCols[j]) {
        kept.push(j);
      }
    }
    if (!kept.length) {
      return "";
    }
    function project(cols) {
      var out = [];
      var k;
      var idx;
      for (k = 0; k < kept.length; k += 1) {
        idx = kept[k];
        out.push(idx < cols.length && cols[idx] != null ? cols[idx] : "");
      }
      return out;
    }
    var header = project(rows[0]);
    var out    = [];
    var sep    = [];
    out.push("| " + header.join(" | ") + " |");
    for (i = 0; i < header.length; i += 1) {
      sep.push("---");
    }
    out.push("| " + sep.join(" | ") + " |");
    for (i = 1; i < rows.length; i += 1) {
      out.push("| " + project(rows[i]).join(" | ") + " |");
    }
    return out.join("\n");
  }

  function appendDescendantImages(el, blocks) {
    var imgs;
    var i;
    var img;
    if (!el || !el.querySelectorAll) {
      return;
    }
    imgs = el.querySelectorAll("img");
    for (i = 0; i < imgs.length; i += 1) {
      img = extractImage(imgs[i]);
      if (img) {
        blocks.push(img);
      }
    }
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
    if (hasCssHiddenAncestor(el) || isIgnoredChrome(el)) {
      return;
    }
    tag = el.tagName;
    if (SKIP_EXPORT_TAGS[tag] || tag === "BUTTON" || tag === "NAV" || tag === "FORM") {
      return;
    }
    if (isThinking(el)) {
      blocks.push({ type: "thinking", text: cleanText(visibleText(el)) });
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
      appendDescendantImages(el, blocks);
      return;
    }
    if (tag === "UL" || tag === "OL") {
      text = listToMarkdown(el);
      if (text) {
        blocks.push({ type: "list", markdown: text });
      }
      appendDescendantImages(el, blocks);
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
        title: cleanText(visibleText(el)) || "source",
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
        ? String(visibleText(el) || "").replace(/^\n+|\n+$/g, "")
        : cleanText(visibleText(el));
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
      if (hasCssHiddenAncestor(el)) {
        continue;
      }
      href = el.getAttribute("href") || "";
      if (el.tagName === "A" || href) {
        out.push({
          type : "citation",
          title: cleanText(visibleText(el)) || "source",
          url  : href,
        });
      }
    }
    return out;
  }

  function citationKey(block) {
    return String((block && block.url) || "") + "\0" + String((block && block.title) || "");
  }

  function visibleMessageContent(node) {
    var roots;
    var i;
    if (!node || !node.querySelectorAll) {
      return node;
    }
    roots = node.querySelectorAll("[data-message-content]");
    for (i = 0; i < roots.length; i += 1) {
      if (!hasCssHiddenAncestor(roots[i])) {
        return roots[i];
      }
    }
    return node;
  }

  function messageFromNode(node) {
    var roleEl  = node.hasAttribute("data-message-author-role")
      ? node
      : node.querySelector("[data-message-author-role]");
    var role    = String((roleEl && roleEl.getAttribute("data-message-author-role")) || "").toLowerCase();
    if (role && role !== "user" && role !== "assistant") {
      return null;
    }
    if (!role) {
      role = "assistant";
    }
    var id      = node.getAttribute("data-message-id") ||
      (roleEl && roleEl.getAttribute("data-message-id")) ||
      "";
    var content = visibleMessageContent(node);
    var blocks  = blocksFromContentRoot(content);
    var thinkingNodes = node.querySelectorAll(
      '[data-testid="reasoning"], [data-testid="thinking"], [data-cwa="thinking"]'
    );
    var seenThinking = false;
    var i;
    var extra;
    var citations;
    var seenCitations;
    var key;
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
        if (hasCssHiddenAncestor(thinkingNodes[i])) {
          continue;
        }
        extra.push({ type: "thinking", text: cleanText(visibleText(thinkingNodes[i])) });
      }
      if (extra.length) {
        blocks = extra.concat(blocks);
      }
    }
    citations = collectCitationBlocks(node);
    seenCitations = Object.create(null);
    for (i = 0; i < blocks.length; i += 1) {
      if (blocks[i].type === "citation") {
        seenCitations[citationKey(blocks[i])] = true;
      }
    }
    for (i = 0; i < citations.length; i += 1) {
      key = citationKey(citations[i]);
      if (seenCitations[key]) {
        continue;
      }
      seenCitations[key] = true;
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
    var searchArea = root || doc;
    var searchRoot = findConversationMain(searchArea);
    var href = options.url || (options.location && options.location.href) || "";
    var title = options.title || conversationTitle(doc);
    var exportedAt = options.exportedAt ||
      (options.clock && options.clock.now && options.clock.now()) ||
      new Date().toISOString();
    var nodes = searchRoot && searchRoot.querySelectorAll
      ? Array.prototype.slice.call(searchRoot.querySelectorAll("[data-message-author-role]"))
      : [];
    var usedFallback = false;
    var messages = [];
    var i;
    var msg;
    if (nodes.length === 0 && searchRoot && searchRoot.querySelectorAll) {
      nodes = Array.prototype.slice.call(
        searchRoot.querySelectorAll('article[data-testid^="conversation-turn-"]')
      );
      usedFallback = true;
    }
    for (i = 0; i < nodes.length; i += 1) {
      if (hasCssHiddenAncestor(nodes[i])) {
        continue;
      }
      if (
        nodes[i].parentElement &&
        typeof nodes[i].parentElement.closest === "function" &&
        (
          nodes[i].parentElement.closest("[data-message-author-role]") ||
          (usedFallback && nodes[i].parentElement.closest('article[data-testid^="conversation-turn-"]'))
        )
      ) {
        continue;
      }
      if (nodes[i].closest && nodes[i].closest(
        "nav, [data-cwa-chrome], .cwa-toolbar, .cwa-palette, .cwa-minimap, .cwa-export-status"
      )) {
        continue;
      }
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
      if (btn && (!thinking || !cleanText(visibleText(thinking)))) {
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

  function findConversationMain(root) {
    var mains;
    var i;
    var node;
    var visible = [];
    var withThread = [];
    if (!root) {
      return null;
    }
    if (String(root.tagName || "").toUpperCase() === "MAIN") {
      return root;
    }
    if (!root.querySelectorAll) {
      return null;
    }
    mains = root.querySelectorAll("main");
    for (i = 0; i < mains.length; i += 1) {
      node = mains[i];
      if (hasCssHiddenAncestor(node)) {
        continue;
      }
      visible.push(node);
      if (node.querySelector(
        "[data-message-author-role], article[data-testid^='conversation-turn-']"
      )) {
        withThread.push(node);
      }
    }
    if (withThread.length) {
      return withThread[withThread.length - 1];
    }
    return visible[visible.length - 1] || null;
  }

  function inspectScope(root) {
    return findConversationMain(root);
  }

  function inspectExportSignals(root, extras) {
    extras = extras || {};
    var scope = inspectScope(root);
    var unloaded = false;
    if (scope && scope.querySelector &&
        scope.querySelector('[data-testid="scroll-to-previous"], [data-testid="conversation-scroll-up"]')) {
      unloaded = true;
    }
    return {
      unloadedMessages     : Boolean(unloaded),
      closedCanvases       : scope ? hasClosedCanvas(scope) : false,
      deepResearchPanels   : scope ? hasDeepResearchGap(scope) : false,
      codeInterpreterFiles : scope ? hasUnfetchedFiles(scope) : false,
      hiddenThinking       : scope ? hasHiddenThinking(scope) : false,
      mediaFetchFailed     : (extras.failedMedia || 0) > 0,
      mediaSkipped         : (extras.skippedMedia || 0) > 0,
    };
  }

  function collapseMediaPath(pathname) {
    var path = String(pathname || "");
    var parts;
    var out;
    var i;
    var part;
    try {
      path = decodeURIComponent(path);
    } catch (err) {
      /* retain the undecoded path for best-effort policy checks */
    }
    path = path.replace(/\\/g, "/").toLowerCase().replace(/\/+/g, "/");
    parts = path.split("/");
    out = [];
    for (i = 0; i < parts.length; i += 1) {
      part = parts[i];
      if (!part || part === ".") {
        continue;
      }
      if (part === "..") {
        if (out.length) {
          out.pop();
        }
        continue;
      }
      out.push(part);
    }
    return "/" + out.join("/");
  }

  function isForbiddenMediaPath(pathname) {
    var path = collapseMediaPath(pathname);
    return path === "/backend-api" ||
      path.indexOf("/backend-api/") === 0 ||
      path === "/api/auth" ||
      path.indexOf("/api/auth/") === 0;
  }

  function mediaUrlDecision(url, origin) {
    var href = String(url || "");
    var parsed;
    var page;
    var sameOrigin;
    var fixtureCdn;
    var isAbsolute = /^https?:\/\//i.test(href);
    var isRootRelative = /^\/(?!\/)/.test(href);
    if (!isAbsolute && !isRootRelative) {
      return { allowed: false, reason: "unsupported_scheme" };
    }
    try {
      if (isRootRelative && !origin) {
        return { allowed: false, reason: "invalid_url" };
      }
      parsed = isRootRelative
        ? new URL(href, origin)
        : new URL(href);
    } catch (err) {
      return { allowed: false, reason: "invalid_url" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { allowed: false, reason: "unsupported_scheme" };
    }
    if (parsed.username || parsed.password) {
      return { allowed: false, reason: "invalid_url" };
    }
    page = null;
    if (origin) {
      try {
        page = new URL(origin);
      } catch (err) {
        page = null;
      }
    }
    if (isRootRelative && !page) {
      return { allowed: false, reason: "invalid_url" };
    }
    sameOrigin = Boolean(
      page &&
      parsed.protocol === page.protocol &&
      parsed.hostname === page.hostname &&
      parsed.port === page.port
    );
    fixtureCdn = parsed.protocol === "https:" &&
      parsed.hostname === "files.oaiusercontent.com" &&
      parsed.port === "";
    if (!sameOrigin && !fixtureCdn) {
      return { allowed: false, reason: "disallowed_host", href: stripUrlFragment(parsed.href) };
    }
    if (isForbiddenMediaPath(parsed.pathname)) {
      return { allowed: false, reason: "forbidden_endpoint", href: stripUrlFragment(parsed.href) };
    }
    return { allowed: true, href: stripUrlFragment(parsed.href) };
  }

  function stripUrlFragment(href) {
    var value = String(href || "");
    var index = value.indexOf("#");
    return index === -1 ? value : value.slice(0, index);
  }

  function isAllowedMediaUrl(url, origin) {
    return mediaUrlDecision(url, origin).allowed;
  }

  function mediaOrigin(root, fallback) {
    var doc;
    var loc;
    if (fallback) {
      return fallback;
    }
    doc = root && root.nodeType === 9 ? root : root && root.ownerDocument;
    loc = doc && doc.defaultView && doc.defaultView.location;
    return (loc && loc.origin && loc.origin !== "null") ? loc.origin : "";
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

  function styleProperty(style, name) {
    if (!style) {
      return "";
    }
    if (typeof style.getPropertyValue === "function") {
      try {
        return String(style.getPropertyValue(name) || "");
      } catch (_err) {
        /* fall through */
      }
    }
    if (name === "clip-path") {
      return String(style.clipPath || "");
    }
    if (name === "content-visibility") {
      return String(style.contentVisibility || "");
    }
    return String(style[name] || "");
  }

  function isDetailsOpen(node) {
    return Boolean(node && (node.open || (node.hasAttribute && node.hasAttribute("open"))));
  }

  function isClosedDetailsContent(node) {
    var parent = node && node.parentElement;
    return Boolean(
      parent &&
      parent.tagName === "DETAILS" &&
      !isDetailsOpen(parent) &&
      node.tagName !== "SUMMARY"
    );
  }

  function isClipCollapsed(style) {
    var clip = String(styleProperty(style, "clip") || "").toLowerCase();
    var clipPath = String(styleProperty(style, "clip-path") || "").toLowerCase();
    if (/rect\(\s*(0|0px|1px)\s*,/.test(clip)) {
      return true;
    }
    if (/inset\(\s*(50%|100%)/.test(clipPath) || /circle\(\s*0/.test(clipPath)) {
      return true;
    }
    return false;
  }

  function hasCssHiddenAncestor(el) {
    var node = el;
    var view;
    var style;
    var display;
    var visibility;
    var opacity;
    var contentVis;
    while (node && node.nodeType === ELEMENT_NODE) {
      if (isClosedDetailsContent(node)) {
        return true;
      }
      if (node.hidden || (node.hasAttribute && node.hasAttribute("hidden"))) {
        return true;
      }
      if (node.inert === true || (node.hasAttribute && node.hasAttribute("inert"))) {
        return true;
      }
      if (node.getAttribute && node.getAttribute("aria-hidden") === "true") {
        return true;
      }
      view = node.ownerDocument && node.ownerDocument.defaultView;
      style = view && typeof view.getComputedStyle === "function"
        ? view.getComputedStyle(node)
        : node.style;
      display    = String((style && style.display) || "").toLowerCase();
      visibility = String((style && style.visibility) || "").toLowerCase();
      opacity    = String((style && style.opacity) || "").trim();
      contentVis = String(
        styleProperty(style, "content-visibility") ||
        styleProperty(node.style, "content-visibility") ||
        ""
      ).toLowerCase();
      if (display === "none" ||
          visibility === "hidden" ||
          visibility === "collapse" ||
          (opacity !== "" && Number(opacity) === 0) ||
          contentVis === "hidden" ||
          isClipCollapsed(style) ||
          isClipCollapsed(node.style)) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function isBlockBoundary(el) {
    if (!el || el.nodeType !== ELEMENT_NODE) {
      return false;
    }
    if (BLOCK_BREAK_TAGS[el.tagName]) {
      return true;
    }
    return Boolean(el.classList && el.classList.contains("cm-line"));
  }

  function visibleText(el) {
    var out = "";
    var nodes;
    var i;
    var child;
    var piece;
    if (!el) {
      return "";
    }
    if (el.nodeType === TEXT_NODE) {
      return el.nodeValue || "";
    }
    if (el.nodeType !== ELEMENT_NODE) {
      return "";
    }
    if (SKIP_EXPORT_TAGS[el.tagName]) {
      return "";
    }
    if (hasCssHiddenAncestor(el)) {
      return "";
    }
    if (el.tagName === "BR") {
      return "\n";
    }
    nodes = el.childNodes || [];
    for (i = 0; i < nodes.length; i += 1) {
      child = nodes[i];
      if (child.nodeType === TEXT_NODE) {
        out += child.nodeValue || "";
      } else if (child.nodeType === ELEMENT_NODE) {
        piece = visibleText(child);
        if (!piece) {
          continue;
        }
        if (isBlockBoundary(child) || child.tagName === "BR") {
          if (out && out.charAt(out.length - 1) !== "\n") {
            out += "\n";
          }
          out += piece;
          if (out && out.charAt(out.length - 1) !== "\n") {
            out += "\n";
          }
        } else {
          out += piece;
        }
      }
    }
    return out;
  }

  function collectVisibleFileCards(root, origin, forbiddenItems) {
    var out = [];
    var scope;
    var links;
    var i;
    var el;
    var href;
    var name;
    var decision;
    if (!root || !root.querySelectorAll) {
      return out;
    }
    scope = findConversationMain(root);
    if (!scope) {
      return out;
    }
    origin = mediaOrigin(root, origin);
    try {
      links = scope.querySelectorAll(
        "a[download], a[href*='/files/'], a[data-testid*='file-card'], " +
        "a[data-testid*='attachment'], [data-testid*='file-card'] a, " +
        "[data-testid*='attachment'] a"
      );
    } catch (err) {
      return out;
    }
    for (i = 0; i < links.length; i += 1) {
      el = links[i];
      if (el.closest && el.closest(
        "nav, [data-cwa-chrome], .cwa-toolbar, .cwa-palette, .cwa-minimap, .cwa-export-status"
      )) {
        continue;
      }
      if (hasCssHiddenAncestor(el)) {
        continue;
      }
      href = el.getAttribute("href") || "";
      if (!href) {
        continue;
      }
      decision = mediaUrlDecision(href, origin);
      if (!decision.allowed) {
        if (forbiddenItems) {
          forbiddenItems.push({ url: href, reason: decision.reason });
        }
        continue;
      }
      name = el.getAttribute("download") || cleanText(visibleText(el)) || "file";
      out.push({ url: href, alt: name, kind: "file-card" });
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
    if (/csv/i.test(mime))  return ".csv";
    if (/text\/plain/i.test(mime)) return ".txt";
    return ".bin";
  }

  function safeMediaBase(alt) {
    var slug = String(alt || "file")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/\.\./g, "")
      .slice(0, 32);
    return slug || "file";
  }

  function sanitizeMediaFilename(index, alt, url, mime) {
    var fromAlt = safeMediaBase(alt);
    var fromUrl = "file";
    var path;
    var slash;
    var seg;
    try {
      path  = String(url || "").split("?")[0].split("#")[0];
      slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
      seg   = slash >= 0 ? path.slice(slash + 1) : path;
      fromUrl = safeMediaBase(seg);
    } catch (err) {
      fromUrl = "file";
    }
    var base = fromAlt !== "file" ? fromAlt : fromUrl;
    if (!base || base.indexOf("..") !== -1) {
      base = "file";
    }
    base = String(base).replace(/[\\/]/g, "");
    var ext  = extensionFromNameOrType(url, mime);
    var name = String(index + 1).padStart(3, "0") + "-" + base + ext;
    return name.replace(/\.\./g, "").replace(/[\\/]/g, "-");
  }

  function nowMs(clock) {
    if (clock && typeof clock.nowMs === "function") {
      return clock.nowMs();
    }
    return Date.now();
  }

  function blobSize(content) {
    if (!content) {
      return 0;
    }
    if (typeof content.size === "number") {
      return content.size;
    }
    if (typeof content.byteLength === "number") {
      return content.byteLength;
    }
    if (typeof content.length === "number") {
      return content.length;
    }
    return 0;
  }

  function signalAborted(signal) {
    return Boolean(signal && signal.aborted);
  }

  function rewriteHref(url, rewrites) {
    var href = String(url || "");
    var stripped;
    if (!href || !rewrites) {
      return href;
    }
    if (rewrites[href]) {
      return rewrites[href];
    }
    stripped = stripUrlFragment(href);
    if (rewrites[stripped]) {
      return rewrites[stripped];
    }
    return href;
  }

  function rewriteMarkdownHrefs(text, rewrites) {
    return String(text || "").replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, function (_match, href, title) {
      return "](" + rewriteHref(href, rewrites) + (title || "") + ")";
    });
  }

  function rewriteThreadMedia(thread, rewrites) {
    rewrites = rewrites || Object.create(null);
    return {
      title     : thread.title,
      url       : thread.url,
      exportedAt: thread.exportedAt,
      messages  : (thread.messages || []).map(function (message) {
        return {
          role  : message.role,
          id    : message.id,
          blocks: (message.blocks || []).map(function (block) {
            if (block.type === "image" && block.url) {
              return { type: "image", url: rewriteHref(block.url, rewrites), alt: block.alt };
            }
            if ((block.type === "paragraph" || block.type === "thinking") && block.text) {
              return {
                type: block.type,
                text: rewriteMarkdownHrefs(block.text, rewrites),
              };
            }
            if ((block.type === "table" || block.type === "list") && block.markdown) {
              return {
                type    : block.type,
                markdown: rewriteMarkdownHrefs(block.markdown, rewrites),
              };
            }
            if (block.type === "citation") {
              return {
                type : "citation",
                title: block.title,
                url  : rewriteHref(block.url, rewrites),
              };
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
    var doc = deps && deps.document;
    var Ev;
    var event;
    Ev = (win && win.CustomEvent) ||
      (doc && doc.defaultView && doc.defaultView.CustomEvent) ||
      (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!Ev) {
      return;
    }
    event = new Ev("cwa:export-status", { bubbles: true, detail: detail });
    if (win && typeof win.dispatchEvent === "function") {
      win.dispatchEvent(event);
    } else if (doc && typeof doc.dispatchEvent === "function") {
      doc.dispatchEvent(event);
    }
  }

  function responseContentLength(res) {
    var raw;
    var size;
    if (!res || !res.headers || typeof res.headers.get !== "function") {
      return null;
    }
    try {
      raw = res.headers.get("content-length");
    } catch (err) {
      return null;
    }
    if (raw == null || !/^\d+$/.test(String(raw).trim())) {
      return null;
    }
    size = Number(raw);
    return Number.isFinite(size) ? size : null;
  }

  async function collectAndFetchMedia(thread, fetchImpl, options) {
    options = options || {};
    var limits = options.limits || {};
    var maxFiles = limits.maxFiles != null ? limits.maxFiles : MEDIA_MAX_FILES;
    var maxEach  = limits.maxBytesEach != null ? limits.maxBytesEach : MEDIA_MAX_BYTES_EACH;
    var maxTotal = limits.maxBytesTotal != null ? limits.maxBytesTotal : MEDIA_MAX_BYTES_TOTAL;
    var maxMs    = limits.maxMs != null ? limits.maxMs : MEDIA_MAX_MS;
    var clock    = options.clock;
    var signal   = options.signal;
    var origin   = mediaOrigin(options.root, options.origin);
    var started  = nowMs(clock);
    var deadline = started + maxMs;
    var setTimeoutImpl = options.setTimeout ||
      (global && typeof global.setTimeout === "function" ? global.setTimeout : null);
    var clearTimeoutImpl = options.clearTimeout ||
      (global && typeof global.clearTimeout === "function" ? global.clearTimeout : null);
    var abortControllerFactory = options.abortControllerFactory || function () {
      return global && typeof global.AbortController === "function"
        ? new global.AbortController()
        : null;
    };
    var candidates;
    var fileCardSkipped = [];
    var seen  = Object.create(null);
    var skippedSeen = Object.create(null);
    var aliases = Object.create(null);
    var list  = [];
    var i;
    var item;
    var url;
    var decision;
    var requestUrl;
    var fetchResult;
    var blobResult;
    var responseDecision;
    var parsedResponseUrl;
    var declaredSize;
    var files       = [];
    var rewrites    = Object.create(null);
    var fetchedUrls = [];
    var failedItems = [];
    var skippedItems = [];
    var totalBytes  = 0;
    var res;
    var content;
    var name;
    var size;
    var timedOut = false;
    var cancelled = false;
    var timeoutId = null;
    var stopKind  = "";
    var stopResolve;
    var stopPromise = new Promise(function (resolve) {
      stopResolve = resolve;
    });
    var currentController = null;
    var onCancel;

    candidates = collectMediaFromMessages(thread && thread.messages)
      .concat(
        options.root
          ? collectVisibleFileCards(options.root, origin, fileCardSkipped)
          : []
      )
      .concat(fileCardSkipped);

    function pushSkipped(href, reason) {
      var skipDecision = mediaUrlDecision(href, origin);
      var key = skipDecision.href || String(href || "");
      if (!key || skippedSeen[key]) {
        return;
      }
      skippedSeen[key] = true;
      skippedItems.push({ url: href, reason: reason });
    }

    function add(entry) {
      var href = entry && entry.url;
      var decision;
      var key;
      if (!href) {
        return;
      }
      decision = mediaUrlDecision(href, origin);
      key = decision.href || String(href);
      if (seen[key]) {
        if (decision.allowed && aliases[key] && aliases[key].indexOf(href) === -1) {
          aliases[key].push(href);
        }
        return;
      }
      seen[key] = true;
      aliases[key] = [href];
      if (!decision.allowed) {
        pushSkipped(href, decision.reason);
        return;
      }
      list.push({
        url : href,
        alt : entry.alt,
        kind: entry.kind,
        key : key,
      });
    }

    function abortCurrent() {
      if (currentController && typeof currentController.abort === "function") {
        try {
          currentController.abort();
        } catch (err) {
          /* abort is best-effort */
        }
      }
    }

    function stop(kind) {
      if (stopKind) {
        return;
      }
      stopKind = kind;
      timedOut = kind === "time_cap";
      cancelled = kind === "cancelled";
      stopResolve({ kind: kind });
      abortCurrent();
    }

    function safeOperation(operation) {
      return Promise.resolve()
        .then(operation)
        .then(
          function (value) {
            return { kind: "value", value: value };
          },
          function (error) {
            return { kind: "error", error: error };
          }
        );
    }

    function raceOperation(operation) {
      return Promise.race([safeOperation(operation), stopPromise]);
    }

    function skipRemaining(index, reason) {
      for (; index < list.length; index += 1) {
        pushSkipped(list[index].url, reason);
      }
    }

    for (i = 0; i < candidates.length; i += 1) {
      add(candidates[i]);
    }
    if (list.length > maxFiles) {
      for (i = maxFiles; i < list.length; i += 1) {
        pushSkipped(list[i].url, "count_cap");
      }
      list = list.slice(0, maxFiles);
    }
    if (!fetchImpl) {
      for (i = 0; i < list.length; i += 1) {
        pushSkipped(list[i].url, "no_fetch");
      }
      return {
        files       : files,
        rewrites    : rewrites,
        failed      : failedItems.length,
        skipped     : skippedItems.length,
        failedItems : failedItems,
        skippedItems: skippedItems,
        fetchedUrls : fetchedUrls,
        cancelled   : false,
      };
    }

    onCancel = function () {
      stop("cancelled");
    };
    if (signal && typeof signal.addEventListener === "function") {
      signal.addEventListener("abort", onCancel, { once: true });
    }
    if (signalAborted(signal)) {
      stop("cancelled");
    }
    if (typeof setTimeoutImpl === "function" && Number.isFinite(maxMs)) {
      timeoutId = setTimeoutImpl(function () {
        stop("time_cap");
      }, Math.max(0, deadline - nowMs(clock)));
    }

    try {
      for (i = 0; i < list.length; i += 1) {
        if (signalAborted(signal)) {
          stop("cancelled");
        }
        if (!stopKind && nowMs(clock) >= deadline) {
          stop("time_cap");
        }
        if (stopKind) {
          skipRemaining(i, stopKind);
          break;
        }
        item = list[i];
        url  = item.url;
        decision = mediaUrlDecision(url, origin);
        if (!decision.allowed) {
          pushSkipped(url, decision.reason);
          continue;
        }
        requestUrl = decision.href;
        try {
          currentController = abortControllerFactory();
          fetchResult = await raceOperation(function () {
            return fetchImpl(requestUrl, {
              credentials: "omit",
              redirect   : "error",
              signal     : currentController && currentController.signal,
            });
          });
          if (fetchResult.kind === "time_cap" || fetchResult.kind === "cancelled") {
            skipRemaining(i, fetchResult.kind);
            break;
          }
          if (fetchResult.kind === "error") {
            failedItems.push({ url: url, reason: "network" });
            continue;
          }
          res = fetchResult.value;
          if (res && (res.redirected === true || res.type === "opaqueredirect")) {
            failedItems.push({ url: url, reason: "redirected_response" });
            continue;
          }
          if (!res || !res.ok) {
            failedItems.push({ url: url, reason: "http_" + (res && res.status ? res.status : "0") });
            continue;
          }
          if (typeof res.url !== "string" || !res.url.trim()) {
            failedItems.push({ url: url, reason: "invalid_response_url" });
            continue;
          }
          try {
            parsedResponseUrl = new URL(res.url);
          } catch (err) {
            failedItems.push({ url: url, reason: "invalid_response_url" });
            continue;
          }
          responseDecision = mediaUrlDecision(parsedResponseUrl.href, origin);
          if (!responseDecision.allowed) {
            failedItems.push({
              url   : url,
              reason: responseDecision.reason,
            });
            continue;
          }
          declaredSize = responseContentLength(res);
          if (declaredSize != null && declaredSize > maxEach) {
            abortCurrent();
            failedItems.push({ url: url, reason: "too_large" });
            continue;
          }
          if (declaredSize != null && declaredSize > maxTotal - totalBytes) {
            abortCurrent();
            pushSkipped(url, "size_cap");
            continue;
          }
          blobResult = await raceOperation(function () {
            return res.blob();
          });
          if (blobResult.kind === "time_cap" || blobResult.kind === "cancelled") {
            skipRemaining(i, blobResult.kind);
            break;
          }
          if (blobResult.kind === "error") {
            failedItems.push({ url: url, reason: "network" });
            continue;
          }
          content = blobResult.value;
          size    = blobSize(content);
          if (size > maxEach) {
            failedItems.push({ url: url, reason: "too_large" });
            continue;
          }
          if (totalBytes + size > maxTotal) {
            pushSkipped(url, "size_cap");
            continue;
          }
          name = sanitizeMediaFilename(files.length, item.alt || "image", url, content && content.type);
          files.push({ name: name, content: content, url: url });
          (aliases[item.key] || [url]).forEach(function (rawUrl) {
            rewrites[rawUrl] = "media/" + name;
          });
          if (item.key) {
            rewrites[item.key] = "media/" + name;
          }
          fetchedUrls.push(url);
          totalBytes += size;
        } catch (err) {
          if (stopKind) {
            skipRemaining(i, stopKind);
            break;
          }
          failedItems.push({ url: url, reason: "network" });
        } finally {
          currentController = null;
        }
      }
    } finally {
      if (timeoutId != null && typeof clearTimeoutImpl === "function") {
        clearTimeoutImpl(timeoutId);
      }
      if (signal && typeof signal.removeEventListener === "function") {
        signal.removeEventListener("abort", onCancel);
      }
    }
    return {
      files       : files,
      rewrites    : rewrites,
      failed      : failedItems.length,
      skipped     : skippedItems.length,
      failedItems : failedItems,
      skippedItems: skippedItems,
      fetchedUrls : fetchedUrls,
      cancelled   : cancelled,
      timedOut    : timedOut,
    };
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
    var inflight   = Object.create(null);
    var mediaLimits = deps.mediaLimits || {};
    var setTimeoutImpl = deps.setTimeout ||
      (global && typeof global.setTimeout === "function" ? global.setTimeout : null);
    var clearTimeoutImpl = deps.clearTimeout ||
      (global && typeof global.clearTimeout === "function" ? global.clearTimeout : null);
    var abortControllerFactory = deps.abortControllerFactory || function () {
      return global && typeof global.AbortController === "function"
        ? new global.AbortController()
        : null;
    };

    function snapshot(extra) {
      extra = extra || {};
      return collectVisibleThread(root, {
        url       : loc.href,
        exportedAt: extra.exportedAt || clock.now(),
        clock     : clock,
        location  : loc,
      });
    }

    function fail(action, code, extra) {
      extra = extra || {};
      emitStatus(deps, {
        action : action,
        ok     : false,
        code   : code,
        message: extra.message || code,
        filename: extra.filename,
      });
      var out = { ok: false, error: code };
      Object.keys(extra).forEach(function (key) {
        if (key !== "message") {
          out[key] = extra[key];
        }
      });
      return out;
    }

    function begin(action) {
      if (inflight[action]) {
        return fail(action, "duplicate", { message: "Export already in progress" });
      }
      inflight[action] = true;
      return null;
    }

    function end(action) {
      inflight[action] = false;
    }

    async function copy() {
      var blocked = begin("copy");
      var thread;
      var md;
      var result;
      if (blocked) {
        return blocked;
      }
      try {
        if (signalAborted(deps.signal)) {
          return fail("copy", "cancelled");
        }
        thread = snapshot();
        if (!isSupportedExportRoute(loc.href, thread.messages.length)) {
          return fail("copy", "unsupported_route");
        }
        md     = serializeThreadToMarkdown(thread, { frontmatter: false });
        result = await copyText(md, { clipboard: clipboard, document: doc });
        if (!result.ok) {
          return fail("copy", "clipboard_denied", { method: result.method, markdown: md });
        }
        emitStatus(deps, { action: "copy", ok: true, code: "ok", method: result.method });
        return { ok: true, markdown: md, method: result.method };
      } finally {
        end("copy");
      }
    }

    async function saveMarkdown() {
      var blocked = begin("save-md");
      var thread;
      var md;
      var name;
      var blob;
      var saved;
      if (blocked) {
        return blocked;
      }
      try {
        if (signalAborted(deps.signal)) {
          return fail("save-md", "cancelled");
        }
        thread = snapshot();
        if (!isSupportedExportRoute(loc.href, thread.messages.length)) {
          return fail("save-md", "unsupported_route");
        }
        md   = serializeThreadToMarkdown(thread, { frontmatter: true });
        name = slugifyFilename(thread.title, thread.exportedAt) + ".md";
        blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        saved = download(blob, name, doc);
        if (saved && typeof saved.then === "function") {
          saved = await saved;
        }
        if (saved === false) {
          return fail("save-md", "download_denied", { filename: name, markdown: md });
        }
        emitStatus(deps, { action: "save-md", ok: true, code: "ok", filename: name });
        return { ok: true, filename: name, markdown: md };
      } finally {
        end("save-md");
      }
    }

    async function saveZip() {
      var blocked = begin("save-zip");
      var thread;
      var media;
      var signals;
      var gaps;
      var chatMd;
      var manifest;
      var manifestObject;
      var zip;
      var blob;
      var name;
      var i;
      var mediaFiles;
      var archiveFiles;
      var saved;
      var partial;
      var snapshotSignals;
      if (blocked) {
        return blocked;
      }
      try {
        if (typeof JSZipImpl !== "function") {
          return fail("save-zip", "jszip_missing", { message: "JSZip is not loaded" });
        }
        if (signalAborted(deps.signal)) {
          return fail("save-zip", "cancelled");
        }
        thread = snapshot();
        if (!isSupportedExportRoute(thread.url || loc.href, thread.messages.length)) {
          return fail("save-zip", "unsupported_route");
        }
        snapshotSignals = inspectExportSignals(root, {});
        media = await collectAndFetchMedia(thread, fetchImpl, {
          limits                : mediaLimits,
          clock                 : clock,
          signal                : deps.signal,
          root                  : root,
          origin                : loc.origin,
          setTimeout            : setTimeoutImpl,
          clearTimeout          : clearTimeoutImpl,
          abortControllerFactory: abortControllerFactory,
        });
        if (media.cancelled && signalAborted(deps.signal)) {
          return fail("save-zip", "cancelled", {
            markdown: serializeThreadToMarkdown(thread, { frontmatter: true }),
          });
        }
        if (!sameExportRoute(thread.url, loc.href)) {
          return fail("save-zip", "route_changed", {
            message: "Conversation changed during export",
          });
        }
        signals = {
          unloadedMessages     : snapshotSignals.unloadedMessages,
          closedCanvases       : snapshotSignals.closedCanvases,
          deepResearchPanels   : snapshotSignals.deepResearchPanels,
          codeInterpreterFiles : snapshotSignals.codeInterpreterFiles,
          hiddenThinking       : snapshotSignals.hiddenThinking,
          mediaFetchFailed     : (media.failed || 0) > 0,
          mediaSkipped         : (media.skipped || 0) > 0,
        };
        gaps     = detectExportGaps(signals);
        chatMd   = serializeThreadToMarkdown(rewriteThreadMedia(thread, media.rewrites), {
          frontmatter: true,
        });
        mediaFiles = media.files.map(function (file) {
          return "media/" + file.name;
        });
        manifestObject = buildManifestObject({
          title     : thread.title,
          url       : thread.url,
          exportedAt: thread.exportedAt,
          included  : { mediaCount: media.files.length },
          gaps      : gaps,
          failedMedia: media.failedItems,
          skippedMedia: media.skippedItems,
          mediaFiles: mediaFiles,
        });
        manifest = buildManifestMarkdown({
          title     : thread.title,
          url       : thread.url,
          exportedAt: thread.exportedAt,
          included  : { chatMd: true, mediaCount: media.files.length },
          gaps      : gaps,
          failedMedia: media.failedItems,
          skippedMedia: media.skippedItems,
        });
        zip = new JSZipImpl();
        zip.file("chat.md", chatMd);
        zip.file("MANIFEST.md", manifest);
        zip.file("manifest.json", JSON.stringify(manifestObject, null, 2));
        for (i = 0; i < media.files.length; i += 1) {
          zip.file("media/" + media.files[i].name, media.files[i].content);
        }
        archiveFiles = zip.files
          ? Object.keys(zip.files)
          : ["chat.md", "MANIFEST.md", "manifest.json"].concat(mediaFiles);
        blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
        if (signalAborted(deps.signal)) {
          return fail("save-zip", "cancelled");
        }
        name = slugifyFilename(thread.title, thread.exportedAt) + ".zip";
        saved = download(blob, name, doc);
        if (saved && typeof saved.then === "function") {
          saved = await saved;
        }
        if (saved === false) {
          return fail("save-zip", "download_denied", {
            filename : name,
            markdown : chatMd,
            manifest : manifest,
            manifestObject: manifestObject,
            files    : archiveFiles,
          });
        }
        partial = media.failed > 0 || media.skipped > 0;
        emitStatus(deps, {
          action  : "save-zip",
          ok      : true,
          code    : partial ? "partial" : "ok",
          filename: name,
        });
        return {
          ok            : true,
          filename      : name,
          gaps          : gaps,
          mediaCount    : media.files.length,
          failedMedia   : media.failedItems,
          skippedMedia  : media.skippedItems,
          partial       : partial,
          formats       : ["md", "zip"],
          files         : archiveFiles,
          manifest      : manifest,
          manifestObject: manifestObject,
          markdown      : chatMd,
        };
      } finally {
        end("save-zip");
      }
    }

    return {
      copy        : copy,
      saveMarkdown: saveMarkdown,
      saveZip     : saveZip,
      snapshot    : snapshot,
    };
  }

  var api = {
    OFFICIAL_EXPORT_HELP      : OFFICIAL_EXPORT_HELP,
    VISIBLE_THREAD_NOTICE     : VISIBLE_THREAD_NOTICE,
    INHERENT_GAPS             : INHERENT_GAPS,
    MEDIA_MAX_FILES           : MEDIA_MAX_FILES,
    MEDIA_MAX_BYTES_EACH      : MEDIA_MAX_BYTES_EACH,
    MEDIA_MAX_BYTES_TOTAL     : MEDIA_MAX_BYTES_TOTAL,
    MEDIA_MAX_MS              : MEDIA_MAX_MS,
    yamlDoubleQuoted          : yamlDoubleQuoted,
    buildFrontmatter          : buildFrontmatter,
    serializeMessageToMarkdown: serializeMessageToMarkdown,
    serializeThreadToMarkdown : serializeThreadToMarkdown,
    detectExportGaps          : detectExportGaps,
    buildManifestMarkdown     : buildManifestMarkdown,
    buildManifestObject       : buildManifestObject,
    parseConversationIdFromUrl: parseConversationIdFromUrl,
    isSupportedExportRoute    : isSupportedExportRoute,
    sameExportRoute           : sameExportRoute,
    slugifyFilename           : slugifyFilename,
    sanitizeMediaFilename     : sanitizeMediaFilename,
    collectVisibleThread      : collectVisibleThread,
    inspectExportSignals      : inspectExportSignals,
    isForbiddenMediaPath      : isForbiddenMediaPath,
    mediaUrlDecision          : mediaUrlDecision,
    isAllowedMediaUrl         : isAllowedMediaUrl,
    collectMediaFromMessages  : collectMediaFromMessages,
    collectVisibleFileCards   : collectVisibleFileCards,
    rewriteThreadMedia        : rewriteThreadMedia,
    copyText                  : copyText,
    triggerDownload           : triggerDownload,
    createExporter            : createExporter,
    collectAndFetchMedia      : collectAndFetchMedia,
  };

  global.CwaExportCore = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
