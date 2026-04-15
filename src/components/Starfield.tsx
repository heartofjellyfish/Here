"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The sky behind the stage. Intentionally sparse:
 *   - ~90 stars, each twinkling on its own 4–10s cycle at a max opacity
 *     that never climbs above "barely noticed."
 *   - Meteors every 22–55s, lasting ~1.6s, at random heights and angles.
 *     Rare enough to feel like something you might miss. Each streak
 *     crosses the whole screen — never a stub that dies in the corner.
 *
 * `flashAt` (optional): a Date.now() timestamp. When it crosses, the
 * entire starfield blooms once — every star briefly full-bright — as if
 * the sky itself were quietly cheering the person on.
 *
 * No grid, no orbits, no nebula. Black is the main character.
 */

type Star = {
  id: number;
  x: number; // %
  y: number; // %
  size: number; // px
  minOpacity: number;
  maxOpacity: number;
  twinkleDur: number; // s
  delay: number; // s
};

type Meteor = {
  id: number;
  topPct: number;
  leftPct: number;
  angleDeg: number;
  durationMs: number;
  lengthPx: number;
  /** How far the streak travels along its rotated axis, in vmax.
   *  vmax (not vmin) guarantees the trail covers the longer screen
   *  dimension, so streaks read as full crossings regardless of
   *  portrait/landscape. */
  travelVmax: number;
  /** Peak opacity — most are faint, a few burn brighter. */
  peakOpacity: number;
};

const STAR_COUNT = 90;
// A second pool of fainter stars that live near the threshold of
// visibility. Before the tap they're essentially asleep; during the
// flash they bloom into view alongside the regulars, thickening the
// sky; afterward they settle onto a very low but non-zero baseline.
// The sky never quite goes back to how sparse it was.
const FLASH_STAR_COUNT = 60;
// The burst is CSS-driven (globals.css, `.starfield--flashing .star`).
// Once the class is applied we never remove it: `starFlashBurst` runs
// for 14s with `forwards`, and a second layered animation —
// `twinkleFromPeak`, delayed 14s — picks up from the same final frame
// and cycles each star from its max down to its min forever. Chaining
// in CSS (rather than toggling the class off at an arbitrary moment)
// is what avoids the "snap back to baseline" we saw before: removing
// the class mid-animation dropped each star to whatever phase the
// base `twinkle` happened to be at, which read as a sudden dim.
// Permanent boost to each star's twinkle range after the tap. Sets the
// baseline the ordinary sky lives at for the rest of the session.
// The previous 1.4 read as "a bit warmer"; 1.8 reads as "noticeably
// brighter than before" without crossing into "the sky is lit up."
const WARM_BOOST = 1.8;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Place a star at a random % position that falls *outside* the earth's
 * visual disk. The earth sits at the viewport center (see .stage in
 * globals.css), so we reject any candidate whose pixel distance from
 * center is within `excludePx`. Without this, small stars drifted over
 * the globe and blurred with the country dots — the sky and the land
 * stopped reading as separate layers.
 *
 * We cap the retry count so this can never spin forever in a pathological
 * viewport; after giving up we accept the last candidate rather than
 * dropping the star entirely. Empirically 12 tries is enough at every
 * size we clamp the earth to.
 */
function randPosOutsideEarth(
  vw: number,
  vh: number,
  excludePx: number,
): { x: number; y: number } {
  const cx = vw / 2;
  const cy = vh / 2;
  const excludeSq = excludePx * excludePx;
  for (let i = 0; i < 12; i++) {
    const x = rand(0, 100);
    const y = rand(0, 100);
    const dx = (x / 100) * vw - cx;
    const dy = (y / 100) * vh - cy;
    if (dx * dx + dy * dy >= excludeSq) return { x, y };
  }
  return { x: rand(0, 100), y: rand(0, 100) };
}

function generateStars(excludePx: number): Star[] {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const main: Star[] = Array.from({ length: STAR_COUNT }, (_, i) => {
    const { x, y } = randPosOutsideEarth(vw, vh, excludePx);
    return {
      id: i,
      x,
      y,
      size: rand(0.6, 1.9),
      minOpacity: rand(0.04, 0.11),
      maxOpacity: rand(0.18, 0.52),
      twinkleDur: rand(4, 10),
      delay: rand(0, 8),
    };
  });
  // Sleeping stars: smaller, very faint at rest. The WARM_BOOST lifts
  // them to "barely there" after the tap, and the flash burst catches
  // their inline --star-min/max baseline at peak.
  const flashers: Star[] = Array.from({ length: FLASH_STAR_COUNT }, (_, i) => {
    const { x, y } = randPosOutsideEarth(vw, vh, excludePx);
    return {
      id: STAR_COUNT + i,
      x,
      y,
      size: rand(0.4, 1.2),
      minOpacity: rand(0.003, 0.012),
      maxOpacity: rand(0.05, 0.14),
      twinkleDur: rand(5, 11),
      delay: rand(0, 8),
    };
  });
  return [...main, ...flashers];
}

type Props = {
  /** Date.now() timestamp at which the starfield should flash once. */
  flashAt?: number | null;
  /** Earth diameter in px — used to carve out a star-free disk around
   *  the globe so small stars don't bleed into the country lights. */
  earthSize?: number;
};

export default function Starfield({ flashAt = null, earthSize = 340 }: Props) {
  // Generate stars client-side only so SSR markup stays deterministic
  // (no hydration mismatch on Math.random).
  const [stars, setStars] = useState<Star[]>([]);
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  const [flashing, setFlashing] = useState(false);
  // Once the universe has flashed, it never goes back to pre-tap.
  // The warmed state persists for the rest of the session: a gentle
  // ambient wash over the sky, each star's baseline quietly lifted.
  const [warmed, setWarmed] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    // Exclude a slightly larger disk than the earth itself: earth
    // radius + ~28px of visual breathing room. Not so large that the
    // whole upper-center of the sky goes empty — just enough that the
    // eye reads "globe, then sky," not a cloud of dots around a globe.
    const excludePx = earthSize / 2 + 28;
    setStars(generateStars(excludePx));
  }, [earthSize]);

  useEffect(() => {
    let timeoutId: number;
    const schedule = () => {
      // Wider gap distribution: most arrivals are 18–45s apart, but ~1 in 5
      // is a longer lull (up to 75s) so the rhythm doesn't feel metronomic.
      const lull = Math.random() < 0.2;
      const delay = lull
        ? rand(45_000, 75_000)
        : rand(18_000, 45_000);
      timeoutId = window.setTimeout(() => {
        const id = nextId.current++;
        // Occasional "long burner" — a fifth of meteors are noticeably
        // longer-tailed and slower-burning. Every meteor still traverses
        // the full screen; "long burner" just means more prominent.
        const longBurn = Math.random() < 0.22;
        const m: Meteor = {
          id,
          topPct: rand(-6, 62),
          leftPct: rand(-18, 38),
          angleDeg: rand(8, 52),
          durationMs: longBurn ? rand(2600, 3800) : rand(1600, 2600),
          lengthPx: longBurn ? rand(260, 380) : rand(150, 260),
          // 160–220vmax guarantees the head exits the opposite edge
          // regardless of starting position or angle.
          travelVmax: longBurn ? rand(180, 230) : rand(150, 200),
          peakOpacity: longBurn ? rand(0.85, 1.0) : rand(0.55, 0.9),
        };
        setMeteors((prev) => [...prev, m]);
        window.setTimeout(() => {
          setMeteors((prev) => prev.filter((x) => x.id !== id));
        }, m.durationMs + 200);
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Universe flash. `flashAt` is a Date.now() moment; we schedule the
  // class toggle relative to now() so we only ever fire the upcoming
  // flash, never a replay of a past one. Warming is toggled at the
  // *same* tick as flashing — React batches, so the burst animation
  // (which overrides the regular twinkle) starts with the boosted
  // --star-min/max baselines already in place.
  //
  // We never turn `flashing` back off. The CSS chain (burst → forwards
  // → twinkleFromPeak) carries each star from its held peak into an
  // infinite cycle around the warmed baseline, all within the same
  // class — no class removal, no opacity discontinuity.
  useEffect(() => {
    if (flashAt == null) return;
    const delay = Math.max(0, flashAt - Date.now());
    const onTimer = window.setTimeout(() => {
      setWarmed(true);
      setFlashing(true);
    }, delay);
    return () => window.clearTimeout(onTimer);
  }, [flashAt]);

  const boost = warmed ? WARM_BOOST : 1;

  return (
    <div
      className={
        "starfield" +
        (warmed ? " starfield--warmed" : "") +
        (flashing ? " starfield--flashing" : "")
      }
      aria-hidden="true"
    >
      {stars.map((s) => (
        <span
          key={s.id}
          className="star"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              // Expose twinkle timing as CSS vars (rather than
              // animation-duration/delay inline) so `.starfield--flashing
              // .star` can compose its multi-animation shorthand from
              // them. Inline longhands beat stylesheet shorthands on
              // specificity, which would otherwise break the chain.
              "--tw-dur": `${s.twinkleDur}s`,
              "--tw-delay": `${s.delay}s`,
              "--star-min": (s.minOpacity * boost).toFixed(3),
              "--star-max": Math.min(1, s.maxOpacity * boost).toFixed(3),
            } as React.CSSProperties
          }
        />
      ))}
      {meteors.map((m) => (
        <span
          key={m.id}
          className="meteor-wrap"
          style={{
            top: `${m.topPct}%`,
            left: `${m.leftPct}%`,
            transform: `rotate(${m.angleDeg}deg)`,
          }}
        >
          <span
            className="meteor"
            style={
              {
                width: `${m.lengthPx}px`,
                animationDuration: `${m.durationMs}ms`,
                "--meteor-travel": `${m.travelVmax}vmax`,
                "--meteor-peak": m.peakOpacity.toFixed(3),
              } as React.CSSProperties
            }
          />
        </span>
      ))}
    </div>
  );
}
