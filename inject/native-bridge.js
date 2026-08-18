/**
 * cwa native companion protocol — fail closed in the page world.
 *
 * Optional host: global.__cwaNative.saveFile({ filename, blob, mime }).
 * Never sends cookies, tokens, Authorization, or conversation JSON.
 * Missing companion → native_unavailable (caller uses Blob download).
 */
(function (global) {
  "use strict";

  var PROTOCOL = "cwa.native.v1";

  function detectHost(root) {
    root = root || global;
    var host = root.__cwaNative;
    if (host && typeof host.saveFile === "function") {
      return host;
    }
    return null;
  }

  function ping(root) {
    var host = detectHost(root);
    if (!host) {
      return { ok: false, error: "native_unavailable", protocol: PROTOCOL };
    }
    if (typeof host.ping === "function") {
      try {
        return { ok: true, protocol: PROTOCOL, pong: host.ping() };
      } catch (err) {
        return { ok: false, error: "native_error", protocol: PROTOCOL };
      }
    }
    return { ok: true, protocol: PROTOCOL };
  }

  function sanitizeFilename(value) {
    var parts;
    var filename;
    if (typeof value !== "string") {
      return null;
    }
    parts = value.split(/[\\/]/);
    filename = parts[parts.length - 1];
    if (
      parts.length !== 1 ||
      !filename ||
      filename === "." ||
      filename === ".." ||
      filename.indexOf("..") !== -1
    ) {
      return null;
    }
    return filename;
  }

  function assertSafePayload(payload) {
    payload = payload || {};
    var key;
    for (key in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) {
        continue;
      }
      if (/cookie|authorization|bearer|token|accessToken|conversationJson|headers/i.test(key)) {
        return { ok: false, error: "forbidden_field" };
      }
    }
    if (!sanitizeFilename(payload.filename) || !payload.blob) {
      return { ok: false, error: "invalid_payload" };
    }
    return { ok: true };
  }

  async function saveFile(payload, root) {
    var safe;
    var host;
    var result;
    var filename;
    try {
      safe = assertSafePayload(payload);
      if (!safe.ok) {
        return safe;
      }
      filename = sanitizeFilename(payload.filename);
      host = detectHost(root);
      if (!host) {
        return { ok: false, error: "native_unavailable", protocol: PROTOCOL };
      }
      result = await host.saveFile({
        filename: filename,
        blob    : payload.blob,
        mime    : payload.mime || "",
      });
      if (!result || result.ok !== true) {
        return {
          ok      : false,
          error   : result && result.error || "native_error",
          protocol: PROTOCOL,
        };
      }
      return { ok: true, protocol: PROTOCOL, via: "native" };
    } catch (err) {
      return { ok: false, error: "native_error", protocol: PROTOCOL };
    }
  }

  var api = {
    PROTOCOL     : PROTOCOL,
    detectHost   : detectHost,
    ping         : ping,
    assertSafePayload: assertSafePayload,
    saveFile     : saveFile,
  };

  global.CwaNativeBridge = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
