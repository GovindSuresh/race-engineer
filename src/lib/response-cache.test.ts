import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearResponseCache } from "./response-cache";

const TTL = 60_000;

beforeEach(() => {
  clearResponseCache();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

/** A loader that counts its calls and resolves with an incrementing value, so
 *  a test can tell a cache hit from a re-fetch by the value alone. */
function counter() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    load: async () => {
      calls += 1;
      return `call ${calls}`;
    },
  };
}

describe("cached", () => {
  it("calls the loader once and serves the rest from cache", async () => {
    const source = counter();

    expect(await cached("k", TTL, source.load)).toBe("call 1");
    expect(await cached("k", TTL, source.load)).toBe("call 1");
    expect(await cached("k", TTL, source.load)).toBe("call 1");
    expect(source.calls).toBe(1);
  });

  // The whole point of caching the promise rather than the value: the
  // duplicate calls this exists to stop arrive in the same tick, before the
  // first has resolved.
  it("collapses callers that arrive before the first call resolves", async () => {
    const source = counter();

    const [a, b, c] = await Promise.all([
      cached("k", TTL, source.load),
      cached("k", TTL, source.load),
      cached("k", TTL, source.load),
    ]);

    expect(source.calls).toBe(1);
    expect([a, b, c]).toEqual(["call 1", "call 1", "call 1"]);
  });

  it("refetches once the entry has expired", async () => {
    const source = counter();

    expect(await cached("k", TTL, source.load)).toBe("call 1");
    vi.setSystemTime(TTL - 1);
    expect(await cached("k", TTL, source.load)).toBe("call 1");
    vi.setSystemTime(TTL + 1);
    expect(await cached("k", TTL, source.load)).toBe("call 2");
    expect(source.calls).toBe(2);
  });

  it("keeps different keys independent", async () => {
    const source = counter();

    expect(await cached("a", TTL, source.load)).toBe("call 1");
    expect(await cached("b", TTL, source.load)).toBe("call 2");
    expect(await cached("a", TTL, source.load)).toBe("call 1");
    expect(source.calls).toBe(2);
  });

  // A cached failure would turn one upstream blip into a TTL-long outage.
  it("does not cache a rejection, and retries on the next call", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      if (calls === 1) throw new Error("upstream blip");
      return "recovered";
    };

    await expect(cached("k", TTL, load)).rejects.toThrow("upstream blip");
    expect(await cached("k", TTL, load)).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("still rejects every caller that shared a failed call", async () => {
    const load = async () => {
      throw new Error("upstream blip");
    };

    const first = cached("k", TTL, load);
    const second = cached("k", TTL, load);

    await expect(first).rejects.toThrow("upstream blip");
    await expect(second).rejects.toThrow("upstream blip");
  });

  it("sweeps expired entries rather than growing without bound", async () => {
    const source = counter();

    for (let i = 0; i < 50; i++) await cached(`key-${i}`, TTL, source.load);
    expect(source.calls).toBe(50);

    // Past every entry's expiry: the next insert should sweep the lot, and the
    // old keys must genuinely be gone rather than merely stale.
    vi.setSystemTime(TTL + 1);
    await cached("fresh", TTL, source.load);

    vi.setSystemTime(TTL + 2);
    expect(await cached("key-0", TTL, source.load)).toBe("call 52");
  });
});
