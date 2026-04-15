import { NextRequest, NextResponse } from "next/server";
import {
  synthesizeAmbientTaps,
  synthesizeSimulatedTaps,
  tapsSince,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Witness stream. After a user has finished their own ritual, the
 * client polls this to know where in the world other people are
 * tapping right now — each returned tap becomes a small, quiet light
 * on the globe.
 *
 * Contract:
 *   GET /api/witness?since=<ms>
 *   → { taps: [{country, createdAtMs}, ...], now: <serverNow> }
 *
 * `since` is a wall-clock timestamp (the server's `now` from the
 * previous poll, or the ritual-end moment for the first poll). `now`
 * is returned so the client uses *server* time as its next `since` —
 * this is the whole trick that lets client and server disagree about
 * their clocks without duplicating or dropping events.
 *
 * Taps include:
 *   - Real taps from the in-memory store (see lib/db.ts)
 *   - Ambient synthetic taps on a steady slow cadence, so the globe
 *     has a pulse even when real traffic is sparse. Ambient events
 *     are keyed to wall-clock boundaries and therefore deterministic:
 *     repeated polls spanning the same interval return the same
 *     events with the same timestamps, so the client can't
 *     double-bloom one, and nothing is ever missed if a poll is
 *     delayed.
 *   - Simulated high-rate traffic (WITNESS_SIMULATE_QPS env var) —
 *     a stand-in for the real audience we don't have yet. Same
 *     deterministic-boundary trick as ambient, just at a much finer
 *     cadence (20ms at 50 qps). Off by default.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("since");
  const now = Date.now();

  // Clamp `since` so a broken client can't make us scan an unbounded
  // history. 90s is a comfortable ceiling: the client polls every 5s
  // in practice, so anything older than that is a bug or a very
  // backgrounded tab; starting fresh at now-90s in those cases costs
  // nothing.
  const parsed = raw ? parseInt(raw, 10) : NaN;
  const lowerBound = now - 90_000;
  const since = Number.isFinite(parsed)
    ? Math.max(parsed, lowerBound)
    : lowerBound;

  const real = tapsSince(since, now);
  const ambient = synthesizeAmbientTaps(since, now);
  const simulated = synthesizeSimulatedTaps(since, now);

  // Merge by timestamp so the client can stagger them by actual
  // wall-clock ordering without doing its own sort.
  const taps = [...real, ...ambient, ...simulated].sort(
    (a, b) => a.createdAtMs - b.createdAtMs,
  );

  return NextResponse.json({ taps, now });
}
