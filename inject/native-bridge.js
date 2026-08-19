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
    var host;
    var pong;
    try {
      host = detectHost(root);
      if (!host) {
        return { ok: false, error: "native_unavailable", protocol: PROTOCOL };
      }
      if (typeof host.ping === "function") {
        pong = host.ping();
        if (pong && typeof pong.then === "function") {
          if (typeof pong.catch === "function") {
            pong.catch(function () {});
          }
          return { ok: false, error: "native_error", protocol: PROTOCOL };
        }
        return { ok: true, protocol: PROTOCOL, pong: pong };
      }
      return { ok: true, protocol: PROTOCOL };
    } catch (_err) {
      return { ok: false, error: "native_error", protocol: PROTOCOL };
    }
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

  function payloadOwnKeys(payload) {
    if (typeof Reflect === "object" && typeof Reflect.ownKeys === "function") {
      return Reflect.ownKeys(payload);
    }
    return Object.keys(payload);
  }

  function assertSafePayload(payload) {
    var keys;
    var key;
    var i;
    var filename;
    var blob;
    var mime;
    var hasFilename = false;
    var hasBlob     = false;
    var hasMime     = false;
    payload = payload || {};
    keys = payloadOwnKeys(payload);
    for (i = 0; i < keys.length; i += 1) {
      key = keys[i];
      if (key !== "filename" && key !== "blob" && key !== "mime") {
        return { ok: false, error: "forbidden_field" };
      }
      if (key === "filename") {
        hasFilename = true;
      } else if (key === "blob") {
        hasBlob = true;
      } else if (key === "mime") {
        hasMime = true;
      }
    }
    if (!hasFilename || !hasBlob) {
      return { ok: false, error: "invalid_payload" };
    }
    filename = sanitizeFilename(payload.filename);
    blob     = payload.blob;
    mime     = hasMime ? payload.mime : "";
    if (
      !filename ||
      !blob ||
      (hasMime && typeof mime !== "string")
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
    return {
      ok      : true,
      filename: filename,
      blob    : blob,
      mime    : mime,
    };
  }

  function awaitHostSave(host, payload, root) {
    var timeoutMs = SAVE_TIMEOUT_MS;
    var timerApi = root
      && typeof root.setTimeout === "function"
      && typeof root.clearTimeout === "function"
      ? root
      : global;
    return new Promise(function (resolve) {
      var settled = false;
      var timer;
      var pending;
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
      try {
        pending = host.saveFile(payload);
      } catch (_err) {
        finish({ ok: false, error: "native_error", protocol: PROTOCOL });
        return;
      }
      Promise.resolve(pending).then(function (value) {
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
    try {
      safe = assertSafePayload(payload);
      if (!safe.ok) {
        return safe;
      }
      host = detectHost(root);
      if (!host) {
        return { ok: false, error: "native_unavailable", protocol: PROTOCOL };
      }
      result = await awaitHostSave(host, {
        filename: safe.filename,
        blob    : safe.blob,
        mime    : safe.mime || "",
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
