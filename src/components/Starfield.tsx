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
const FLASH_MS = 2000;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, (_, i) => ({
    id: i,
    x: rand(0, 100),
    y: rand(0, 100),
    size: rand(0.6, 1.9),
    minOpacity: rand(0.04, 0.11),
    maxOpacity: rand(0.18, 0.52),
    twinkleDur: rand(4, 10),
    delay: rand(0, 8),
  }));
}

type Props = {
  /** Date.now() timestamp at which the starfield should flash once. */
  flashAt?: number | null;
};

export default function Starfield({ flashAt = null }: Props) {
  // Generate stars client-side only so SSR markup stays deterministic
  // (no hydration mismatch on Math.random).
  const [stars, setStars] = useState<Star[]>([]);
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  const [flashing, setFlashing] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    setStars(generateStars());
  }, []);

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
  // flash, never a replay of a past one (e.g., if the prop is set in
  // the past by mistake, we fire immediately rather than skipping).
  useEffect(() => {
    if (flashAt == null) return;
    const delay = Math.max(0, flashAt - Date.now());
    const onTimer = window.setTimeout(() => {
      setFlashing(true);
      window.setTimeout(() => setFlashing(false), FLASH_MS);
    }, delay);
    return () => window.clearTimeout(onTimer);
  }, [flashAt]);

  return (
    <div
      className={`starfield${flashing ? " starfield--flashing" : ""}`}
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
              animationDuration: `${s.twinkleDur}s`,
              animationDelay: `${s.delay}s`,
              "--star-min": s.minOpacity.toFixed(3),
              "--star-max": s.maxOpacity.toFixed(3),
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
