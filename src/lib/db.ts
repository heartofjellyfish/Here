/**
 * In-memory tap store. Chosen over SQLite-on-disk because the target
 * deployment (Vercel serverless) has an ephemeral filesystem — a SQLite
 * file wouldn't survive cold starts, and multiple function instances
 * can't share one anyway.
 *
 * What this gives us:
 *   - A rolling window of recent taps (ring buffer, bounded memory)
 *   - recent5m count and recentCountries list, which are the only two
 *     things the UI actually reads
 *
 * What it doesn't give us (and we don't currently need):
 *   - Long-term persistence across function cold starts
 *   - Daily / weekly rollups
 *
 * If/when we want real persistence, swap this module for a Vercel KV or
 * Postgres backend. The exported function signatures don't need to change.
 */

type TapRecord = {
  createdAtMs: number;
  country: string | null;
};

// Keep at most this many records in memory. At 5-min windows, anything
// older than 5 min is read-dead anyway; the cap just bounds memory if a
// warm instance sees a burst.
const MAX_RECORDS = 2000;

// Cache on globalThis so Next.js dev reloads don't reset the store.
const g = globalThis as unknown as { __tapStore?: TapRecord[] };

function store(): TapRecord[] {
  if (!g.__tapStore) g.__tapStore = [];
  return g.__tapStore;
}

/** Drop records older than the widest window we read (5 min), keeping the
 *  store O(recent-window-size) rather than unbounded. Cheap: just a slice. */
function prune(now: number): void {
  const arr = store();
  const cutoff = now - 5 * 60 * 1000;
  // Records are inserted in chronological order, so we can drop a prefix.
  let drop = 0;
  while (drop < arr.length && arr[drop].createdAtMs < cutoff) drop++;
  if (drop > 0) arr.splice(0, drop);
  // Hard cap — if a single instance took thousands of taps inside 5 min,
  // we'd rather lose the oldest than leak memory.
  if (arr.length > MAX_RECORDS) arr.splice(0, arr.length - MAX_RECORDS);
}

export function recordTap(
  country: string | null,
): { recent5m: number; recentCountries: string[] } {
  const now = Date.now();
  const arr = store();
  arr.push({ createdAtMs: now, country });
  prune(now);
  const window = 5 * 60 * 1000;
  return {
    recent5m: recentCount(window),
    recentCountries: recentCountries(window),
  };
}

export function recentCount(windowMs: number): number {
  const now = Date.now();
  prune(now);
  const since = now - windowMs;
  const arr = store();
  // Records are chronological — binary search would be nicer but linear
  // is fine at this scale.
  let n = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].createdAtMs < since) break;
    n++;
  }
  return n;
}

/** Distinct country codes tapped within the window, most-recent first.
 *  Nulls (taps with no detected country) are excluded. */
export function recentCountries(windowMs: number): string[] {
  const now = Date.now();
  prune(now);
  const since = now - windowMs;
  const arr = store();
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const r = arr[i];
    if (r.createdAtMs < since) break;
    if (!r.country) continue;
    if (seen.has(r.country)) continue;
    seen.add(r.country);
    out.push(r.country);
  }
  return out;
}
