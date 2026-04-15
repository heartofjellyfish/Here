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

/**
 * Mock baseline so the world never feels empty. The real count and
 * country list are layered *on top of* this — real taps are still
 * stored and returned as real, this just adds a floor.
 *
 * Format: [country_code, fake_tap_count]. Countries picked to spread
 * across continents so the globe lights up in many regions at once.
 * Counts are very rough population-weighted guesses; they only drive
 * the presence number, not any analytics.
 *
 * Remove this block (and the mock* helpers below) once there's enough
 * real traffic to carry the vibe on its own.
 */
const MOCK_TAPS: ReadonlyArray<readonly [string, number]> = [
  ["CN", 38], ["US", 32], ["IN", 24], ["JP", 19],
  ["BR", 15], ["DE", 13], ["GB", 12], ["FR", 11],
  ["KR", 10], ["ID", 9], ["MX", 8], ["IT", 8],
  ["ES", 7], ["CA", 7], ["AU", 7], ["RU", 7],
  ["TR", 6], ["VN", 5], ["TH", 5], ["PH", 5],
  ["PL", 5], ["NL", 4], ["AR", 4], ["EG", 4],
  ["NG", 4], ["SA", 3], ["MY", 3], ["TW", 3],
  ["ZA", 3], ["SE", 3], ["CL", 3], ["CO", 3],
  ["NZ", 3], ["AE", 3], ["IL", 2], ["KE", 2],
];

const MOCK_BASE_COUNT = MOCK_TAPS.reduce((s, [, n]) => s + n, 0);
const MOCK_COUNTRIES = MOCK_TAPS.map(([c]) => c);

/** Gentle ±10 fluctuation over a ~7-minute cycle so the number feels
 *  like it's breathing instead of frozen. Deterministic on wall clock. */
function mockCount(now: number): number {
  const phase = (now / 1000 / 60) * ((Math.PI * 2) / 7);
  return MOCK_BASE_COUNT + Math.round(Math.sin(phase) * 10);
}

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
  return n + mockCount(now);
}

/** Distinct country codes tapped within the window, most-recent first.
 *  Nulls (taps with no detected country) are excluded. Real taps lead,
 *  mock countries fill in underneath so there's always a chorus. */
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
  for (const c of MOCK_COUNTRIES) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}
