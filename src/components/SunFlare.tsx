"use client";

import { useEffect, useRef } from "react";

/**
 * Physically-inspired lens flare driven per-frame.
 *
 * Why JS instead of CSS keyframes:
 * Real lens-flare ghosts form on the *axis* from the light source
 * through the lens's optical center, landing on the opposite side of
 * center at distances determined by which internal surfaces they
 * reflected off of. One moving sun, one optical axis — so as the sun
 * swings across the sky, the whole ghost chain rotates and slides
 * coherently around the viewport center. It's also non-uniform:
 * - Ghosts at different axial positions move at different rates
 *   (a ghost at t=-1.5 travels 1.5× as fast as one at t=-0.5).
 * - Overall brightness breathes — peaking while the sun is near the
 *   frame, dimming as it leaves.
 * - Ghosts defocus and swell when the sun is close to center.
 *
 * Authoring those relationships in raw CSS keyframes would require
 * 8+ hand-synced animations all doing scaled versions of the sun's
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
  // After the flare chain lights up (~9%), the sun picks up a
  // touch of extra speed — intermediate waypoints shifted 1% (~1.5s)
  // earlier so each station is reached sooner. Subtle; the peak
  // time stays locked at 46% so flare sync is preserved.
  [11, -36, 10],
  [19, -24, 0],
  [31, -12, -8],
  [46, 0, -13],
  [54, 13, -9],
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
// envelope is asymmetric — slow rise, fast fall — so the flare
// builds as the sun climbs, peaks at zenith, and clears out of
// the way once the sun is past its high point. A symmetric
// envelope kept the flare lingering well into the sun's descent,
// which felt like it overstayed.
const FLARE_WINDOW_START = 9;
// The diffraction starburst leads the ghost chain by ~4% (~6s):
// it seeps in from 5% with its own ease-in curve, so by the time
// the ghosts arrive at 9% the spikes are already softly present.
// Starburst shares PEAK and END with the ghost chain.
const STARBURST_WINDOW_START = 5;
const FLARE_WINDOW_PEAK = 46;  // matches the sun's zenith in SUN_WAYPOINTS
// 1% of a 153s cycle ≈ 1.53s. FLARE_WINDOW_END = 65.6 → 19.6% past
// peak → ~30s fade past zenith. The shape of the fade (see the
// envelope calc below) drops quickly at first then settles into a
// long slow tail, so "mostly gone" happens around half the window
// and "completely gone" only at the very end — reads as the flare
// losing energy gradually rather than snapping off.
const FLARE_WINDOW_END = 65.6;

// Volumetric "god rays" / crepuscular shafts — separate from the
// lens flare (which is reflections inside the lens). These are
// light scattering through air/dust in the scene itself and are
// kept on a tight window around peak only, with a low cap alpha,
// so they don't drown the earth and the phrase. If it looks gaudy
// at peak, narrowing this window or lowering the alpha in CSS is
// the first knob to turn.
const GODRAYS_WINDOW_START = 38;  // ~12s before peak
const GODRAYS_WINDOW_END = 54;    // ~12s after peak

type GhostKind = "glint" | "disc" | "ring" | "anchor";
type GhostDef = {
  // Axial position along the line from the sun through the lens's
  // optical center (0,0). Negative values live on the opposite side
  // of center from the sun — where most ghosts actually form. A
  // small positive value places a ghost *between* the sun and
  // center — the bright "glint" close to the light source that a
  // real flare always has.
  t: number;
  // Base diameter in vw. Ghosts breathe around this size as sun
  // position changes (defocus growth near center).
  size: number;
  // "r, g, b" for rgba() — each ghost is its own warm tint, not
  // pure white. Hottest (near-white) at the sun-end of the chain,
  // deepening through amber to deep orange at the tail.
  hue: string;
  kind: GhostKind;
  // Gaussian blur radius in px. Small sharp glints stay crisp;
  // large defocused ghosts get heavy blur so they read as soft
  // atmospheric artifacts rather than colored discs.
  blur: number;
  // Per-ghost phase offset for the brightness wobble so no two
  // ghosts pulse in lockstep — otherwise the chain reads as a
  // single rhythmic unit instead of independent reflections.
  alphaPhase: number;
  // Small perpendicular nudge off the strict axis (in vw), so the
  // chain doesn't look like a ruler-straight line of beads.
  perpOffset: number;
  // How strongly this ghost's size responds to the sun being near
  // the optical axis. Rings swell dramatically when the sun nears
  // center (the signature "iris bloom" of a real lens flare); a
  // big already-huge anchor disc should grow *less* so the whole
  // chain doesn't collapse into one amorphous blob at zenith.
  // Unitless multiplier on the defocus value.
  defocusResponse: number;
  // Independent phase for size pulsing. Separate from alphaPhase
  // so each ghost breathes its own rhythm in both brightness AND
  // size, rather than the whole chain inflating in lockstep.
  sizePhase: number;
};

// Chromatic palette — deliberately restrained.
//
// A full Interstellar-style dichroic chain (three saturated rings
// in amber / cyan / purple) is too showy for this scene: the page
// is a quiet meditation, the flare is atmosphere, not spectacle.
// Three ring colors also pulls the eye away from the earth and
// the phrase — the two things that actually carry the emotion.
//
// So the chain keeps just ONE ring (the warm iris artifact, which
// universally reads as "lens flare") and uses hue variation on
// the discs to hint at chromatic separation without advertising
// it. One disc is slightly cool so the chain isn't a single-tone
// amber stripe, but it stays desaturated enough to feel like
// internal reflection rather than stained glass.
const GHOSTS: GhostDef[] = [
  // Bright glint between sun and center — the sharp hot pinpoint
  // every real lens flare has closest to the source. Stays small
  // and crisp: a real highlight doesn't bloom. This is the ONLY
  // near-sun ghost now; previously there was also a small pale
  // disc right after it, but the two read as redundant dots.
  { t: 0.22, size: 2, hue: "255, 253, 240", kind: "glint", blur: 0.6, alphaPhase: 0.0, perpOffset: 0.0, defocusResponse: 0.25, sizePhase: 0.2 },
  // The *one* aperture-iris ring. Warm amber — the classic coated
  // iris artifact. Highest defocusResponse: a real iris ring
  // visibly pulses between tight and wide as the sun's off-axis
  // angle changes.
  { t: -0.3, size: 7, hue: "255, 230, 180", kind: "ring", blur: 1.8, alphaPhase: 1.6, perpOffset: -0.7, defocusResponse: 1.4, sizePhase: 2.0 },
  // The anchor — the biggest ghost in the chain, rendered as a
  // hex with rim+core structure (bright iris band around a softer
  // core). This is the Interstellar "signature" ghost: you can see
  // the aperture blades because the reflection formed close to the
  // stopped-down iris, and it shows depth rather than reading as a
  // solid disc.
  { t: -0.5, size: 13, hue: "255, 215, 155", kind: "anchor", blur: 3.2, alphaPhase: 2.4, perpOffset: 0.5, defocusResponse: 1.4, sizePhase: 3.3 },
  // Subtly cool disc sitting where the hex used to be. The
  // chromatic-separation job it was doing still needs doing —
  // one cool patch breaks up the otherwise all-amber chain —
  // but it doesn't need to be the hexagon.
  { t: -0.68, size: 6, hue: "205, 220, 235", kind: "disc", blur: 1.8, alphaPhase: 3.3, perpOffset: -0.4, defocusResponse: 0.8, sizePhase: 4.1 },
  // Amber ghost further along the chain.
  { t: -0.9, size: 9, hue: "255, 188, 122", kind: "disc", blur: 2.6, alphaPhase: 4.5, perpOffset: 1.1, defocusResponse: 0.35, sizePhase: 0.7 },
  // Deepening amber approaching the tail. Warm-only from here
  // so the chain resolves back to the scene's overall color
  // mood.
  { t: -1.15, size: 7, hue: "255, 172, 108", kind: "disc", blur: 2.0, alphaPhase: 5.4, perpOffset: -0.9, defocusResponse: 0.9, sizePhase: 5.6 },
  // Small warm tail — sharper again at the far end of the chain.
  { t: -1.5, size: 4.5, hue: "255, 155, 92", kind: "disc", blur: 1.3, alphaPhase: 0.4, perpOffset: 0.6, defocusResponse: 0.6, sizePhase: 2.8 },
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
  const starburstRef = useRef<HTMLDivElement | null>(null);
  const godRaysRef = useRef<HTMLDivElement | null>(null);

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
      const now = performance.now();
      const cyclePct = ((now % SUN_CYCLE_MS) / SUN_CYCLE_MS) * 100;

      // Envelope: zero outside the window. Peak is pinned to the
      // sun's zenith (46%), not the window midpoint — a symmetric
      // bell would peak before zenith, which looks wrong.
      //   Rise (START → PEAK): pow(u, 1.6) — ease-IN. Invisible at
      //                        first, seeps in quietly, then builds
      //                        quickly toward the peak. Replaced
      //                        the previous sin(u*π/2), which was
      //                        ease-OUT (fast start) and made the
      //                        chain feel like it popped into
      //                        existence.
      //   Fall (PEAK → END):   pow(1-u, 2.2) — drops ~half in the
      //                        first 30% of the fall window, then a
      //                        long slow tail that reaches zero at
      //                        the very end. "Mostly gone" around
      //                        the midpoint, "completely gone" only
      //                        at the end.
      let envelope = 0;
      if (cyclePct >= FLARE_WINDOW_START && cyclePct <= FLARE_WINDOW_END) {
        if (cyclePct < FLARE_WINDOW_PEAK) {
          const u =
            (cyclePct - FLARE_WINDOW_START) /
            (FLARE_WINDOW_PEAK - FLARE_WINDOW_START);
          envelope = Math.pow(u, 1.6);
        } else {
          const u =
            (cyclePct - FLARE_WINDOW_PEAK) /
            (FLARE_WINDOW_END - FLARE_WINDOW_PEAK);
          envelope = Math.pow(1 - u, 2.2);
        }
      }

      // Starburst envelope — same PEAK and END as ghost chain but
      // with its own earlier START and a gentler ease-in exponent
      // (1.3 vs 1.6) so by the time the ghost chain is barely on
      // screen, the spikes are already softly present. Reads as
      // "the light announces itself first, then the lens artifacts
      // catch up."
      let burstEnvelope = 0;
      if (cyclePct >= STARBURST_WINDOW_START && cyclePct <= FLARE_WINDOW_END) {
        if (cyclePct < FLARE_WINDOW_PEAK) {
          const u =
            (cyclePct - STARBURST_WINDOW_START) /
            (FLARE_WINDOW_PEAK - STARBURST_WINDOW_START);
          burstEnvelope = Math.pow(u, 1.3);
        } else {
          const u =
            (cyclePct - FLARE_WINDOW_PEAK) /
            (FLARE_WINDOW_END - FLARE_WINDOW_PEAK);
          burstEnvelope = Math.pow(1 - u, 2.2);
        }
      }

      // --- Camera drift ---
      // Two independent slow sine waves on X and Y with different
      // periods so the motion never closes into a circle — reads
      // as breath, not orbit. Amplitudes intentionally small: we
      // want the optical center to feel *unfixed* without the
      // earth or phrase appearing to move. This shifts only the
      // flare's reference point, not the scene itself — a real
      // camera move would translate everything, but moving the
      // earth competes with the emotional focus. Treat it as the
      // lens elements shifting slightly within a fixed body.
      const camX = 1.5 * Math.sin(now * 0.00022);
      const camY = 0.8 * Math.sin(now * 0.00015 + 1.3);

      // Sun position relative to the (now drifting) optical
      // center, and its distance from it.
      const [rawSx, rawSy] = sunPosAt(cyclePct);
      const sx = rawSx - camX;
      const sy = rawSy - camY;
      const dist = Math.hypot(sx, sy);

      // Defocus growth: when the sun is near the optical axis, each
      // ghost's reflection is near its own focal point and blooms
      // larger. Raw 0→1 value that each ghost modulates by its own
      // defocusResponse — rings pulse dramatically, the big anchor
      // disc barely budges.
      const defocus = Math.max(0, 1 - dist / 55);

      // Global amplitude kept close to 1 across the window so more
      // than just two ghosts are ever visible simultaneously.
      const globalAlpha = envelope;

      for (let i = 0; i < GHOSTS.length; i++) {
        const g = GHOSTS[i];
        const el = ghostRefs.current[i];
        if (!el) continue;

        // Ghost position = opticalCenter + t · (sun - opticalCenter).
        // With the optical center drifting as (camX, camY), this
        // expands to camCoord · (1 - t) + t · sunCoord — meaning
        // far-from-center ghosts parallax *more* than near ones,
        // which is exactly what real off-axis elements do.
        const gx = camX * (1 - g.t) + g.t * rawSx + g.perpOffset;
        const gy = camY * (1 - g.t) + g.t * rawSy + g.perpOffset * 0.4;

        // Size driven by two independent sources so the chain
        // doesn't inflate in lockstep:
        //   1. defocus × per-ghost response × global defocus gain.
        //      Global gain 2.5 makes near-axis bloom dramatic (the
        //      "奇观" moment when the lens stares into the source).
        //      Per-ghost response picks who swells most: anchor and
        //      ring pump hard, glint stays crisp.
        //   2. per-ghost size wobble on its own sine phase — gives
        //      each reflection its own breath independent of the
        //      sun's position. Small amplitude so it reads as
        //      shimmer, not jitter.
        const sizeWobble =
          1 + 0.07 * Math.sin(g.sizePhase + cyclePct * 0.11);
        const scale = (1 + defocus * g.defocusResponse * 2.5) * sizeWobble;

        // Alpha wobble: per-ghost sine so each one breathes at
        // its own phase. Range 0.8–1.0, so ghosts never go to
        // zero from wobble alone — only the envelope drives them
        // fully dark.
        const wobble =
          0.9 + 0.1 * Math.sin(g.alphaPhase + cyclePct * 0.14);

        const alpha = globalAlpha * wobble;

        // Two translates: first offset into the viewport via
        // vw/vh, then center the element on its own origin with
        // percent-of-self translate. Scale applies around
        // transform-origin (center by default), so the ghost grows
        // from its own center, not a corner.
        el.style.transform =
          `translate(${gx.toFixed(2)}vw, ${gy.toFixed(2)}vh) ` +
          `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        el.style.opacity = Math.max(0, Math.min(1, alpha)).toFixed(3);

        // The anchor's core fill alpha tracks defocus. Off-axis it's
        // a hollow donut (correct for an iris reflection caught on
        // the aperture edge). On-axis, the whole aperture is lit
        // dead-on and the reflection forms through the full opening
        // — donut collapses into a filled iris bloom. Without this,
        // the anchor at peak still reads as a ring, which contradicts
        // the physics the rest of the chain obeys.
        if (g.kind === "anchor") {
          const coreAlpha = 0.05 + defocus * 0.55;
          el.style.setProperty("--anchor-core", coreAlpha.toFixed(3));
        }
      }

      // Diffraction starburst — the 4-pointed spike pattern a
      // bright light source creates when it passes through a
      // polygonal aperture (the same physics that makes stars
      // look "pointed" in photographs). Anchors directly TO the
      // sun, not the viewport center, because the spikes emanate
      // from the light itself. Rotates very slowly so the spikes
      // feel alive rather than rubber-stamped, and brightens
      // dramatically as the sun approaches the optical axis —
      // that's the "奇观" moment where the lens is staring
      // directly into the source.
      if (starburstRef.current) {
        // Position at the sun. Use the raw sun coords (not the
        // camera-drifted ones) because the starburst *is* on the
        // sun, and the sun isn't shifted by camera drift — the
        // sun is a scene object, only the flare ghosts parallax.
        const bx = rawSx;
        const by = rawSy;
        // Strongly peaked at center: the spikes are most dramatic
        // when the sun is dead-on, and nearly invisible when it's
        // far off-axis. burstEnvelope already carries the ease-in
        // shape, so no extra pow() needed here.
        const burstAlpha = burstEnvelope * (0.35 + defocus * 0.65);
        const burstScale = 0.8 + defocus * 0.9;
        const burstRot = (now * 0.006) % 360;
        starburstRef.current.style.transform =
          `translate(${bx.toFixed(2)}vw, ${by.toFixed(2)}vh) ` +
          `translate(-50%, -50%) ` +
          `rotate(${burstRot.toFixed(2)}deg) scale(${burstScale.toFixed(3)})`;
        starburstRef.current.style.opacity = Math.max(0, Math.min(1, burstAlpha)).toFixed(3);
      }

      // God rays — volumetric light shafts in the scene (not inside
      // the lens). Own narrow window centered on peak so they don't
      // overstay. Ease-in on the rise, ease-out on the fall so they
      // crescendo into the peak moment. Hard-capped at 0.35 alpha:
      // full-frame ray field would drown the earth and the phrase;
      // this is meant to be a whisper, not a floodlight.
      if (godRaysRef.current) {
        let rayEnv = 0;
        if (cyclePct >= GODRAYS_WINDOW_START && cyclePct <= GODRAYS_WINDOW_END) {
          if (cyclePct < FLARE_WINDOW_PEAK) {
            const u =
              (cyclePct - GODRAYS_WINDOW_START) /
              (FLARE_WINDOW_PEAK - GODRAYS_WINDOW_START);
            rayEnv = Math.pow(u, 1.8);
          } else {
            const u =
              (cyclePct - FLARE_WINDOW_PEAK) /
              (GODRAYS_WINDOW_END - FLARE_WINDOW_PEAK);
            rayEnv = Math.pow(1 - u, 1.8);
          }
        }
        // Alpha capped deliberately low so the page stays readable.
        const rayAlpha = rayEnv * 0.35;
        // Very slow rotation — one full rev every ~6 minutes.
        // Rays need to feel alive without drawing the eye.
        const rayRot = (now * 0.0015) % 360;
        // Centered on the sun's screen position (raw, not drifted).
        godRaysRef.current.style.transform =
          `translate(${rawSx.toFixed(2)}vw, ${rawSy.toFixed(2)}vh) ` +
          `translate(-50%, -50%) ` +
          `rotate(${rayRot.toFixed(2)}deg)`;
        godRaysRef.current.style.opacity = Math.max(0, Math.min(1, rayAlpha)).toFixed(3);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="sun-flare" aria-hidden="true">
      <div ref={godRaysRef} className="sun-flare__rays" />
      <div ref={starburstRef} className="sun-flare__starburst" />
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
              "--ghost-blur": `${g.blur}px`,
              width: `${g.size}vw`,
              height: `${g.size}vw`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
