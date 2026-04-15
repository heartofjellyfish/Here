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

/**
 * Real taps in the window (sinceMs, nowMs], oldest first. Used by the
 * witness stream so the client can bloom each point at (or close to)
 * its actual wall-clock moment. Unlike the functions above, this does
 * NOT mix in the mock baseline — those are layered by
 * `synthesizeAmbientTaps` as deterministic events so repeated polls
 * return consistent timestamps.
 */
export function tapsSince(
  sinceMs: number,
  nowMs: number,
): { country: string; createdAtMs: number }[] {
  prune(nowMs);
  const arr = store();
  const out: { country: string; createdAtMs: number }[] = [];
  for (const r of arr) {
    if (r.createdAtMs <= sinceMs) continue;
    if (r.createdAtMs > nowMs) continue;
    if (!r.country) continue;
    out.push({ country: r.country, createdAtMs: r.createdAtMs });
  }
  return out;
}

/**
 * Synthetic "someone else, somewhere else" taps that fire at a steady
 * slow cadence so the witness view never feels dead in low-traffic
 * windows. Deterministic in wall-clock time — two polls that overlap
 * the same interval return the same events with the same timestamps,
 * so the client can't double-count and nothing is ever missed if a
 * poll is delayed by network lag.
 *
 * Cadence is intentionally slower than real tap rates: if the world
 * is actually busy, real taps dominate; when it's quiet, the ambient
 * pulse carries the "万家灯火" feeling at its own slow rhythm.
 */
const AMBIENT_CADENCE_MS = 22_000;
// Real-traffic threshold for `auto` mode. If at least this many real
// taps happened in the last AMBIENT_TRAFFIC_WINDOW_MS, the world is
// busy enough to carry itself and we stop emitting ambient events.
// Below the threshold, ambient fires at full cadence. Intentionally a
// step function rather than a smooth ramp — once real traffic arrives
// the ambient quietly steps aside, and if traffic ebbs we step back in.
const AMBIENT_REAL_THRESHOLD = 4;
const AMBIENT_TRAFFIC_WINDOW_MS = 90_000;

function ambientCountryAt(boundaryMs: number): string {
  // Simple integer hash of the boundary timestamp → index into
  // MOCK_COUNTRIES. Picks a country in a non-repeating-looking order.
  // Using xorshift-ish mixing because (ts % n) cycles predictably.
  let x = (boundaryMs / AMBIENT_CADENCE_MS) | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const idx = Math.abs(x) % MOCK_COUNTRIES.length;
  return MOCK_COUNTRIES[idx];
}

/**
 * Should ambient events fire right now? Three modes, read fresh on
 * every request so toggling the env var on a live deployment takes
 * effect on the next poll without a redeploy (Vercel env var changes
 * do need a redeploy, but setting via platform UI is still simpler
 * than shipping code).
 *
 *   WITNESS_AMBIENT=on    → always emit ambient (force warm)
 *   WITNESS_AMBIENT=off   → never emit ambient (force honest/empty)
 *   WITNESS_AMBIENT=auto  → emit when real traffic is too sparse
 *                           to carry the experience on its own
 *                           (default)
 */
export function ambientEnabled(nowMs: number): boolean {
  const mode = (process.env.WITNESS_AMBIENT ?? "auto").toLowerCase();
  if (mode === "on") return true;
  if (mode === "off") return false;
  // auto: count real taps in the trailing window. Walk backwards —
  // records are chronological, so we can stop as soon as we pass the
  // cutoff.
  const arr = store();
  const cutoff = nowMs - AMBIENT_TRAFFIC_WINDOW_MS;
  let real = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].createdAtMs < cutoff) break;
    if (arr[i].country) real++;
    if (real >= AMBIENT_REAL_THRESHOLD) return false;
  }
  return true;
}

export function synthesizeAmbientTaps(
  sinceMs: number,
  nowMs: number,
): { country: string; createdAtMs: number }[] {
  // When the simulator is on, the slow ambient cadence (one every 22s)
  // is noise at that scale — suppress it so the globe reads as coming
  // from one coherent source of fake traffic rather than two cadences
  // fighting each other.
  if (simulateQps() > 0) return [];
  if (!ambientEnabled(nowMs)) return [];
  const out: { country: string; createdAtMs: number }[] = [];
  // First cadence boundary strictly greater than sinceMs.
  let t =
    Math.floor(sinceMs / AMBIENT_CADENCE_MS) * AMBIENT_CADENCE_MS +
    AMBIENT_CADENCE_MS;
  while (t <= nowMs) {
    out.push({ country: ambientCountryAt(t), createdAtMs: t });
    t += AMBIENT_CADENCE_MS;
  }
  return out;
}

/**
 * Simulated high-rate traffic. When WITNESS_SIMULATE_QPS=N is set, the
 * witness endpoint pretends there are N taps per second coming in from
 * around the world — a stand-in for the real audience we don't have
 * yet. Used to preview what the "万家灯火" effect looks like at busy
 * scale without waiting for organic traffic.
 *
 * Deterministic on wall-clock boundaries, same trick as
 * synthesizeAmbientTaps: two overlapping polls return the same events
 * with the same timestamps, so nothing is double-counted or dropped.
 *
 * Cap at 200 qps — at 50+ qps the globe is already reading as
 * "constantly blooming everywhere," and anything above 200 just
 * floods the client with setTimeouts without adding visible density.
 * Zero or unset means the simulator is off (production default).
 */
function simulateQps(): number {
  const raw = process.env.WITNESS_SIMULATE_QPS;
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 200);
}

function simulatedCountryAt(boundaryMs: number): string {
  // Same xorshift hash style as ambientCountryAt, with a different
  // seed multiplier so the simulated stream doesn't visibly correlate
  // with the ambient one (matters only if both are running — they
  // don't in practice, but keeping them de-correlated is cheap).
  let x = ((boundaryMs * 9973) ^ 0xdeadbeef) | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const idx = Math.abs(x) % MOCK_COUNTRIES.length;
  return MOCK_COUNTRIES[idx];
}

export function synthesizeSimulatedTaps(
  sinceMs: number,
  nowMs: number,
): { country: string; createdAtMs: number }[] {
  const qps = simulateQps();
  if (qps <= 0) return [];
  // 1000/qps gives the gap between adjacent synthetic events. At 50 qps
  // that's 20ms — fine-grained enough that the client's stagger
  // distributes them smoothly across the 4.5s blooming window.
  const cadenceMs = 1000 / qps;
  const out: { country: string; createdAtMs: number }[] = [];
  // First boundary strictly greater than sinceMs, aligned to the grid.
  let t = Math.floor(sinceMs / cadenceMs) * cadenceMs + cadenceMs;
  while (t <= nowMs) {
    out.push({ country: simulatedCountryAt(t), createdAtMs: t });
    t += cadenceMs;
  }
  return out;
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
