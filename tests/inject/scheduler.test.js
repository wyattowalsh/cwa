import { describe, expect, it } from "vitest";
import schedulerMod from "../../inject/scheduler.js";

describe("CwaScheduler", () => {
  it("coalesces jobs with the same id so only the latest runs", () => {
    const pending = new Map();
    let seq = 0;
    const sched = schedulerMod.createScheduler({
      raf: (fn) => {
        const handle = (seq += 1);
        pending.set(handle, fn);
        return handle;
      },
      caf: (handle) => {
        pending.delete(handle);
      },
      setTimeout: (fn) => {
        const handle = (seq += 1);
        pending.set(handle, fn);
        return handle;
      },
      clearTimeout: (handle) => {
        pending.delete(handle);
      },
    });

    let value = 0;
    sched.schedule("work", () => {
      value = 1;
    });
    sched.schedule("work", () => {
      value = 2;
    });
    expect(pending.size).toBe(1);
    pending.forEach((fn) => fn());
    expect(value).toBe(2);
  });

  it("coalesces the same id across raf then timeout scheduling", () => {
    const rafPending = new Map();
    const timeoutPending = new Map();
    const cafCalls = [];
    let seq = 0;
    const sched = schedulerMod.createScheduler({
      raf: (fn) => {
        const handle = `raf-${(seq += 1)}`;
        rafPending.set(handle, fn);
        return handle;
      },
      caf: (handle) => {
        cafCalls.push(handle);
        rafPending.delete(handle);
      },
      setTimeout: (fn) => {
        const handle = `timeout-${(seq += 1)}`;
        timeoutPending.set(handle, fn);
        return handle;
      },
      clearTimeout: (handle) => timeoutPending.delete(handle),
    });

    const values = [];
    sched.schedule("work", () => values.push("raf"));
    sched.schedule("work", () => values.push("timeout"), { kind: "timeout", delay: 10 });

    expect(cafCalls).toEqual(["raf-1"]);
    expect(rafPending.size).toBe(0);
    expect(timeoutPending.size).toBe(1);
    timeoutPending.forEach((fn) => fn());
    expect(values).toEqual(["timeout"]);
  });

  it("cancel removes a pending timeout job", () => {
    const pending = new Map();
    let seq = 0;
    const sched = schedulerMod.createScheduler({
      raf: (fn) => {
        const handle = (seq += 1);
        pending.set(handle, fn);
        return handle;
      },
      caf: (handle) => pending.delete(handle),
      setTimeout: (fn) => {
        const handle = (seq += 1);
        pending.set(handle, fn);
        return handle;
      },
      clearTimeout: (handle) => pending.delete(handle),
    });
    sched.schedule("later", () => {}, { kind: "timeout", delay: 80 });
    expect(sched.cancel("later")).toBe(true);
    expect(pending.size).toBe(0);
  });

  it("flush cancels every pending job", () => {
    const cancelledRafs = [];
    const cancelledTimeouts = [];
    const sched = schedulerMod.createScheduler({
      raf: () => "raf-handle",
      caf: (handle) => cancelledRafs.push(handle),
      setTimeout: () => "timeout-handle",
      clearTimeout: (handle) => cancelledTimeouts.push(handle),
    });

    sched.schedule("paint", () => {});
    sched.schedule("later", () => {}, { kind: "timeout", delay: 20 });
    sched.flush();

    expect(cancelledRafs).toEqual(["raf-handle"]);
    expect(cancelledTimeouts).toEqual(["timeout-handle"]);
    expect(sched.pending()).toEqual([]);
  });
});
