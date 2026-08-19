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
  var SAVE_TIMEOUT_MS = 8000;

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
    var pong;
    if (!host) {
      return { ok: false, error: "native_unavailable", protocol: PROTOCOL };
    }
    if (typeof host.ping === "function") {
      try {
        pong = host.ping();
        if (pong && typeof pong.then === "function") {
          if (typeof pong.catch === "function") {
            pong.catch(function () {});
          }
          return { ok: false, error: "native_error", protocol: PROTOCOL };
        }
        return { ok: true, protocol: PROTOCOL, pong: pong };
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
    var keys;
    var key;
    var filename;
    var blob;
    payload = payload || {};
    keys = Object.keys(payload);
    for (key = 0; key < keys.length; key += 1) {
      if (keys[key] !== "filename" && keys[key] !== "blob" && keys[key] !== "mime") {
        return { ok: false, error: "forbidden_field" };
      }
    }
    if (keys.indexOf("filename") === -1 || keys.indexOf("blob") === -1) {
      return { ok: false, error: "invalid_payload" };
    }
    filename = sanitizeFilename(payload.filename);
    blob = payload.blob;
    if (
      !filename ||
      !blob ||
      (keys.indexOf("mime") !== -1 && typeof payload.mime !== "string")
    ) {
      return { ok: false, error: "invalid_payload" };
    }
    if (typeof global.Blob === "function") {
      if (!(blob instanceof global.Blob)) {
        return { ok: false, error: "invalid_payload" };
      }
    } else if (typeof blob.size !== "number" || typeof blob.slice !== "function") {
      return { ok: false, error: "invalid_payload" };
    }
    if (filename.toLowerCase() === "conversation.json") {
      return { ok: false, error: "forbidden_filename" };
    }
    return { ok: true };
  }

  function awaitHostSave(host, payload, root) {
    var timeoutMs = SAVE_TIMEOUT_MS;
    var timerApi = root && typeof root.setTimeout === "function" ? root : global;
    return new Promise(function (resolve) {
      var settled = false;
      var timer;
      function finish(value) {
        if (settled) {
          return;
        }
        settled = true;
        if (timer != null && typeof timerApi.clearTimeout === "function") {
          timerApi.clearTimeout(timer);
        }
        resolve(value);
      }
      if (typeof timerApi.setTimeout === "function") {
        timer = timerApi.setTimeout(function () {
          finish({ ok: false, error: "native_error", protocol: PROTOCOL });
        }, timeoutMs);
      }
      Promise.resolve(host.saveFile(payload)).then(function (value) {
        finish(value);
      }, function () {
        finish({ ok: false, error: "native_error", protocol: PROTOCOL });
      });
    });
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
      result = await awaitHostSave(host, {
        filename: filename,
        blob    : payload.blob,
        mime    : payload.mime || "",
      }, root || global);
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
