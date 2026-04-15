"use client";

import { useEffect, useRef } from "react";

/**
 * Physically-inspired lens flare driven per-frame.
 *
 * Why JS instead of CSS keyframes:
 * Real lens flare ghosts form on the *axis* from the light source
 * through the lens's optical center, landing on the opposite side of
 * center at distances determined by which internal surfaces they
 * reflected off of. One moving sun, one optical axis — so as the sun
 * swings across the sky, the whole ghost chain rotates and slides
 * coherently around the viewport center. It's also non-uniform:
 * - Ghosts at different axial positions move at different rates
 *   (a ghost at t=-1.5 travels 1.5× as fast as one at t=-0.5).
 * - Overall brightness breathes — peaking when the sun is somewhere
 *   near the frame edge, dimming when it's far off or exactly at the
 *   optical center (where all ghosts collapse to one point).
 * - Ghosts defocus and swell when the sun is close to center.
 *
 * Authoring those relationships in raw CSS keyframes would require
 * 6+ hand-synced animations all doing scaled versions of the sun's
 * path. Trivial per-frame JS instead: read sun position from the
 * same waypoints as the CSS sun, project each ghost onto the axis,
 * modulate size/alpha, write it to transform+opacity.
 */

// ---- Sun arc waypoints ----
// MUST stay in sync with the .sun-glow @keyframes sunArc in globals.css.
// Format: [cyclePct, translateX in vw, translateY in vh].
const SUN_WAYPOINTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -80, 60],
  [0.6, -78, 58],
  [1.5, -70, 50],
  [3, -58, 35],
  [6, -45, 20],
  [12, -36, 10],
  [20, -24, 0],
  [32, -12, -6],
  [46, 0, -10],
  [54, 13, -7],
  [61, 26, -1],
  [68, 40, 11],
  [75, 52, 25],
  [82, 62, 40],
  [88, 70, 52],
  [92, 100, 130],
  [97, -100, 130],
  [100, -80, 60],
];

const SUN_CYCLE_MS = 153_000;

// ---- Flare active window ----
// Outside this range the sun is either below the horizon or so far
// off-axis that a lens would produce no meaningful artifacts. The
// envelope function rises and falls smoothly inside the window so
// the flare emerges and dissipates rather than snapping on/off.
const FLARE_WINDOW_START = 8;
const FLARE_WINDOW_END = 82;

type GhostKind = "disc" | "ring";
type GhostDef = {
  // Axial position along the line from the sun through the lens's
  // optical center (0,0). Negative values live on the opposite side
  // of center from the sun — where ghosts actually form. Magnitude
  // controls both how far down the chain the ghost sits AND how
  // fast it moves when the sun moves.
  t: number;
  // Base diameter in vw. Ghosts breathe around this size as sun
  // position changes (defocus growth near center).
  size: number;
  // "r, g, b" for rgba() — each ghost is its own warm tint, not
  // pure white. Hotter colors near the source, deeper amber toward
  // the far end of the chain.
  hue: string;
  kind: GhostKind;
  // Per-ghost phase offset for the brightness wobble so no two
  // ghosts pulse in lockstep — otherwise the chain reads as a
  // single rhythmic unit instead of independent reflections.
  alphaPhase: number;
  // Small perpendicular nudge off the strict axis (in vw), so the
  // chain doesn't look like a ruler-straight line of beads.
  perpOffset: number;
};

const GHOSTS: GhostDef[] = [
  // Close to the sun-side: small, pale, hottest color. Moves slowly.
  { t: -0.22, size: 3.5, hue: "255, 248, 220", kind: "disc", alphaPhase: 0.0, perpOffset: 0.3 },
  // Aperture-iris ring just past center. Light amber.
  { t: -0.4, size: 7, hue: "255, 228, 175", kind: "ring", alphaPhase: 1.2, perpOffset: -0.8 },
  // Big soft disc — anchor of the chain, warmest mid-amber.
  { t: -0.62, size: 12, hue: "255, 210, 150", kind: "disc", alphaPhase: 2.1, perpOffset: 0.5 },
  // Second ring, overlaps the big disc — dense cluster.
  { t: -0.78, size: 6, hue: "255, 195, 130", kind: "ring", alphaPhase: 3.3, perpOffset: -0.4 },
  // Deeper amber ghost, further along the chain.
  { t: -1.05, size: 9, hue: "255, 175, 110", kind: "disc", alphaPhase: 4.6, perpOffset: 1.2 },
  // Smallest and most orange — tail of the chain.
  { t: -1.45, size: 5, hue: "255, 155, 90", kind: "disc", alphaPhase: 0.7, perpOffset: -1.0 },
];

// Linearly interpolate sun position from the waypoint table.
function sunPosAt(cyclePct: number): [number, number] {
  for (let i = 0; i < SUN_WAYPOINTS.length - 1; i++) {
    const [p0, x0, y0] = SUN_WAYPOINTS[i];
    const [p1, x1, y1] = SUN_WAYPOINTS[i + 1];
    if (cyclePct >= p0 && cyclePct <= p1) {
      const k = (cyclePct - p0) / (p1 - p0);
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
  }
  return [SUN_WAYPOINTS[0][1], SUN_WAYPOINTS[0][2]];
}

export default function SunFlare() {
  const ghostRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    // Respect the OS "prefers-reduced-motion" setting — a chain of
    // moving bright artifacts is exactly the kind of thing that
    // triggers vestibular sensitivity.
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let raf = 0;

    const tick = () => {
      const cyclePct =
        ((performance.now() % SUN_CYCLE_MS) / SUN_CYCLE_MS) * 100;

      // Envelope: zero outside the window, sin-bell inside. Peaks
      // at the window midpoint (≈45%), which is very close to the
      // sun's zenith at 46%.
      let envelope = 0;
      if (cyclePct >= FLARE_WINDOW_START && cyclePct <= FLARE_WINDOW_END) {
        const u =
          (cyclePct - FLARE_WINDOW_START) /
          (FLARE_WINDOW_END - FLARE_WINDOW_START);
        envelope = Math.sin(u * Math.PI);
      }

      // Sun position and its distance from the optical center.
      const [sx, sy] = sunPosAt(cyclePct);
      const dist = Math.hypot(sx, sy);

      // Suppresses the ghosts when sun is extremely close to center
      // (where they'd all collapse into one overlapping blob with
      // no visible chain structure). Rises smoothly from 0 at
      // center to 1 by ~15 units away.
      const centerDip = Math.min(1, dist / 15);

      // Defocus growth: when the sun is near the optical axis, each
      // ghost's reflection is near its own focal point and blooms
      // larger. Subtle effect — up to ~40% size increase at center.
      const defocus = Math.max(0, 1 - dist / 55);

      for (let i = 0; i < GHOSTS.length; i++) {
        const g = GHOSTS[i];
        const el = ghostRefs.current[i];
        if (!el) continue;

        const gx = g.t * sx + g.perpOffset;
        const gy = g.t * sy + g.perpOffset * 0.4;

        const scale = 1 + defocus * 0.4;

        // Wobble: per-ghost sine so each one breathes at its own
        // phase. Range 0.7–1.0, so ghosts never go to zero from
        // wobble alone — only the envelope drives them fully dark.
        const wobble =
          0.85 + 0.15 * Math.sin(g.alphaPhase + cyclePct * 0.14);

        const alpha = envelope * centerDip * wobble;

        // Two translates: first offset into the viewport via
        // vw/vh, then center the element on its own origin with
        // percent-of-self translate. Scale applies around
        // transform-origin (center by default), so the ghost grows
        // from its own center, not a corner.
        el.style.transform =
          `translate(${gx.toFixed(2)}vw, ${gy.toFixed(2)}vh) ` +
          `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        el.style.opacity = Math.max(0, Math.min(1, alpha)).toFixed(3);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="sun-flare" aria-hidden="true">
      {GHOSTS.map((g, i) => (
        <div
          key={i}
          ref={(el) => {
            ghostRefs.current[i] = el;
          }}
          className={`sun-flare__ghost sun-flare__ghost--${g.kind}`}
          style={
            {
              "--ghost-hue": g.hue,
              width: `${g.size}vw`,
              height: `${g.size}vw`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
