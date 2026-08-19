import { afterEach, describe, expect, it, vi } from "vitest";
import bridge from "../../inject/native-bridge.js";

describe("CwaNativeBridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports native_unavailable when no host is present", async () => {
    expect(bridge.ping({})).toMatchObject({ ok: false, error: "native_unavailable" });
    await expect(
      bridge.saveFile({ filename: "chat.md", blob: new Blob(["x"]) }, {})
    ).resolves.toMatchObject({ ok: false, error: "native_unavailable" });
  });

  it("rejects payloads that look like cookie or token harvest", async () => {
    expect(bridge.assertSafePayload({ filename: "x", blob: new Blob(["a"]), cookie: "a=b" })).toEqual({
      ok   : false,
      error: "forbidden_field",
    });
    const host = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    await expect(
      bridge.saveFile({ filename: "x.md", blob: new Blob(["a"]), cookie: "a=b" }, { __cwaNative: host })
    ).resolves.toMatchObject({ ok: false, error: "forbidden_field" });
    expect(host.saveFile).not.toHaveBeenCalled();
  });

  it("rejects an extra benign field without calling the host", async () => {
    const host = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    await expect(
      bridge.saveFile(
        { filename: "cwa.md", blob: new Blob(["md"]), note: "local export" },
        { __cwaNative: host }
      )
    ).resolves.toEqual({ ok: false, error: "forbidden_field" });
    expect(host.saveFile).not.toHaveBeenCalled();
  });

  it("rejects bytes alongside a Blob without calling the host", async () => {
    const host = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    await expect(
      bridge.saveFile(
        { filename: "cwa.md", blob: new Blob(["md"]), bytes: new Uint8Array([1]) },
        { __cwaNative: host }
      )
    ).resolves.toEqual({ ok: false, error: "forbidden_field" });
    expect(host.saveFile).not.toHaveBeenCalled();
  });

  it("accepts a cwa.md Blob and forwards exactly filename/blob/mime", async () => {
    const blob = new Blob(["md"], { type: "text/markdown" });
    const host = {
      saveFile: vi.fn(async (payload) => {
        expect(Object.keys(payload).sort()).toEqual(["blob", "filename", "mime"]);
        expect(payload).toEqual({ filename: "cwa.md", blob, mime: "" });
        return { ok: true };
      }),
    };
    await expect(
      bridge.saveFile({ filename: "cwa.md", blob }, { __cwaNative: host })
    ).resolves.toMatchObject({ ok: true, via: "native" });
    expect(host.saveFile).toHaveBeenCalledTimes(1);
  });

  it("rejects traversal and path filenames as invalid_payload", () => {
    const blob = new Blob(["md"]);
    expect(bridge.assertSafePayload({ filename: "../evil.md", blob })).toEqual({
      ok   : false,
      error: "invalid_payload",
    });
    expect(bridge.assertSafePayload({ filename: "a/b.md", blob })).toEqual({
      ok   : false,
      error: "invalid_payload",
    });
  });

  it("rejects the exact conversation.json filename case-insensitively", async () => {
    const host = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    await expect(
      bridge.saveFile(
        { filename: "Conversation.JSON", blob: new Blob(["{}"]) },
        { __cwaNative: host }
      )
    ).resolves.toEqual({ ok: false, error: "forbidden_filename" });
    expect(host.saveFile).not.toHaveBeenCalled();
  });

  it("rejects a bytes-only payload as a forbidden field without calling the host", async () => {
    const host = {
      saveFile: vi.fn(async () => ({ ok: true })),
    };
    await expect(
      bridge.saveFile(
        { filename: "cwa.md", bytes: new Uint8Array([1]) },
        { __cwaNative: host }
      )
    ).resolves.toEqual({
      ok   : false,
      error: "forbidden_field",
    });
    expect(host.saveFile).not.toHaveBeenCalled();
  });

  it("rejects thenable ping results synchronously as native_error", () => {
    const host = {
      saveFile: vi.fn(),
      ping    : vi.fn(() => Promise.reject(new Error("host failed"))),
    };

    expect(bridge.ping({ __cwaNative: host })).toMatchObject({
      ok   : false,
      error: "native_error",
    });

    host.ping.mockReturnValue({ then() {} });
    expect(bridge.ping({ __cwaNative: host })).toMatchObject({
      ok   : false,
      error: "native_error",
    });
  });

  it("rejects a missing blob without extra fields as invalid_payload", () => {
    expect(bridge.assertSafePayload({ filename: "cwa.md" })).toEqual({
      ok   : false,
      error: "invalid_payload",
    });
  });

  it("rejects non-Blob data and a non-string mime", () => {
    expect(bridge.assertSafePayload({ filename: "cwa.md", blob: { size: 2 } })).toEqual({
      ok   : false,
      error: "invalid_payload",
    });
    expect(bridge.assertSafePayload({
      filename: "cwa.md",
      blob    : new Blob(["md"]),
      mime    : 42,
    })).toEqual({
      ok   : false,
      error: "invalid_payload",
    });
  });

  it("duck-types Blob payloads when Blob is unavailable", () => {
    vi.stubGlobal("Blob", undefined);
    const blob = {
      size : 1,
      slice: function () {
        return this;
      },
    };

    expect(bridge.assertSafePayload({ filename: "cwa.md", blob })).toEqual({ ok: true });
    expect(bridge.assertSafePayload({ filename: "cwa.md", blob: { size: 1 } })).toEqual({
      ok   : false,
      error: "invalid_payload",
    });
    expect(bridge.assertSafePayload({ filename: "cwa.md", blob: "md" })).toEqual({
      ok   : false,
      error: "invalid_payload",
    });
  });

  it("treats an undefined host result as native_error", async () => {
    const host = { saveFile: vi.fn(async () => undefined) };
    await expect(
      bridge.saveFile({ filename: "cwa.md", blob: new Blob(["md"]) }, { __cwaNative: host })
    ).resolves.toMatchObject({ ok: false, error: "native_error" });
  });

  it("returns native_error when the host throws", async () => {
    const host = {
      saveFile: vi.fn(() => {
        throw new Error("host failed");
      }),
    };
    await expect(
      bridge.saveFile({ filename: "cwa.md", blob: new Blob(["md"]) }, { __cwaNative: host })
    ).resolves.toMatchObject({ ok: false, error: "native_error" });
  });

  it("returns native_error when the host rejects", async () => {
    const host = { saveFile: vi.fn(async () => Promise.reject(new Error("host failed"))) };
    await expect(
      bridge.saveFile({ filename: "cwa.md", blob: new Blob(["md"]) }, { __cwaNative: host })
    ).resolves.toMatchObject({ ok: false, error: "native_error" });
  });

  it("times out a never-settling host saveFile as native_error", async () => {
    vi.useFakeTimers();
    const host = { saveFile: vi.fn(() => new Promise(() => {})) };
    const pending = bridge.saveFile(
      { filename: "cwa.md", blob: new Blob(["md"]) },
      { __cwaNative: host }
    );

    await vi.advanceTimersByTimeAsync(8000);

    await expect(pending).resolves.toMatchObject({
      ok   : false,
      error: "native_error",
    });
  });
});
