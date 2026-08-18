import { describe, expect, it, vi } from "vitest";
import bridge from "../../inject/native-bridge.js";

describe("CwaNativeBridge", () => {
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

  it("forwards exactly filename/blob/mime to the host", async () => {
    const host = {
      saveFile: vi.fn(async (payload) => {
        expect(Object.keys(payload).sort()).toEqual(["blob", "filename", "mime"]);
        return { ok: true };
      }),
    };
    const blob = new Blob(["md"], { type: "text/markdown" });
    await expect(
      bridge.saveFile(
        { filename: "cwa.md", blob, mime: "text/markdown", bytes: new Uint8Array([1]) },
        { __cwaNative: host }
      )
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

  it("rejects a bytes-only payload without a blob", () => {
    expect(bridge.assertSafePayload({ filename: "cwa.md", bytes: new Uint8Array([1]) })).toEqual({
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
});
