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

  var NATIVE_ERRORS = {
    native_error       : true,
    native_unavailable : true,
    invalid_payload    : true,
    forbidden_field    : true,
    forbidden_filename : true,
  };

  function detectHost(root) {
    root = root || global;
    var host = root.__cwaNative;
    var save = host && host.saveFile;
    if (!host || typeof save !== "function") {
      return null;
    }
    return { host: host, saveFile: save };
  }

  function nativeErrorCode(error) {
    if (typeof error === "string" && NATIVE_ERRORS[error]) {
      return error;
    }
    return "native_error";
  }

  function ping(root) {
    var detected;
    var host;
    var pingFn;
    var pong;
    try {
      detected = detectHost(root);
      if (!detected) {
        return { ok: false, error: "native_unavailable", protocol: PROTOCOL };
      }
      host = detected.host;
      pingFn = host && host.ping;
      if (typeof pingFn === "function") {
        pong = pingFn.call(host);
        if (pong && typeof pong.then === "function") {
          if (typeof pong.catch === "function") {
            pong.catch(function () {});
          }
          return { ok: false, error: "native_error", protocol: PROTOCOL };
        }
        if (pong == null || typeof pong === "string" || typeof pong === "boolean" || typeof pong === "number") {
          return { ok: true, protocol: PROTOCOL, pong: pong };
        }
        return { ok: true, protocol: PROTOCOL };
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
      filename.indexOf("..") !== -1 ||
      /[\u0000-\u001f\u007f:]/.test(filename)
    ) {
      return null;
    }
    filename = filename.replace(/[.\s]+$/g, "");
    if (!filename || filename.toLowerCase() === "conversation.json") {
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

  function conversationJsonBasename(value) {
    var name;
    if (typeof value !== "string") {
      return false;
    }
    name = value.split(/[\\/]/).pop() || "";
    name = name.replace(/[.\s]+$/g, "");
    return name.toLowerCase() === "conversation.json";
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
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, error: "invalid_payload" };
    }
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
    if (!filename) {
      if (conversationJsonBasename(payload.filename)) {
        return { ok: false, error: "forbidden_filename" };
      }
      return { ok: false, error: "invalid_payload" };
    }
    if (!blob || (hasMime && typeof mime !== "string")) {
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

  function awaitHostSave(saveFn, host, payload, root) {
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
        pending = saveFn.call(host, payload);
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
    var detected;
    var result;
    try {
      safe = assertSafePayload(payload);
      if (!safe.ok) {
        return safe;
      }
      detected = detectHost(root);
      if (!detected) {
        return { ok: false, error: "native_unavailable", protocol: PROTOCOL };
      }
      result = await awaitHostSave(detected.saveFile, detected.host, {
        filename: safe.filename,
        blob    : safe.blob,
        mime    : safe.mime || "",
      }, root || global);
      if (!result || result.ok !== true) {
        return {
          ok      : false,
          error   : nativeErrorCode(result && result.error),
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
