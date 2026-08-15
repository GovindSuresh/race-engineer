/** A tiny time-to-live cache that also collapses concurrent callers.
 *
 *  Deliberately dependency-free (no Next, no React) so it can be unit-tested
 *  on its own and reused by any server-side caller.
 *
 *  ## Why not Next's `fetch` data cache
 *
 *  Two reasons, both specific to what this app caches:
 *
 *  1. **Keying.** Our upstream responses are personalised by an `Authorization`
 *     header, and Next's docs pin down the data cache's key as the URL and
 *     options without saying how headers participate. Getting that wrong would
 *     mean serving one user's data to another, which is a bad thing to leave
 *     resting on undocumented behaviour. An explicit key can't be wrong by
 *     accident.
 *  2. **Development.** Next's data cache is bypassed whenever the browser sends
 *     `cache-control: no-cache`, which it does on a hard refresh — i.e. exactly
 *     the case this is meant to make cheap.
 *
 *  ## Scope
 *
 *  In-process, so it lives as long as the server does: it persists across
 *  requests under `next dev` and on a long-lived Node server, and on a
 *  serverless platform (where memory doesn't survive between invocations) it
 *  degrades to no caching rather than to anything incorrect.
 */

interface CacheEntry {
  expiresAt: number;
  /** The in-flight PROMISE, not the resolved value.
   *
   *  This is what makes concurrent callers share a single upstream call, and
   *  it's the more important half of this cache: the duplicate requests it
   *  exists to stop are near-simultaneous — React Strict Mode runs an effect
   *  twice in the same tick during development, and two browser tabs opening
   *  together do the same thing. A cache that only stored resolved values
   *  would still miss twice and still send two requests. */
  promise: Promise<unknown>;
}

const entries = new Map<string, CacheEntry>();

/** Returns the cached response for `key`, or calls `load()` and caches it.
 *
 *  A rejected promise is evicted rather than cached: one upstream blip should
 *  cost one failed request, not lock the caller out for the whole TTL.
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();

  const hit = entries.get(key);
  if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;

  // Bounded by (endpoints × connected users), which is single digits in
  // practice — swept anyway so a long-running server can't accumulate entries
  // for tokens nobody is using any more.
  for (const [staleKey, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(staleKey);
  }

  const promise = load();
  entries.set(key, { expiresAt: now + ttlMs, promise });

  promise.catch(() => {
    // Only evict our own entry — a later call may already have replaced it.
    if (entries.get(key)?.promise === promise) entries.delete(key);
  });

  return promise;
}

/** Drops everything. For tests; there's no runtime need to invalidate, since
 *  every entry is keyed per user and expires on its own. */
export function clearResponseCache(): void {
  entries.clear();
}
