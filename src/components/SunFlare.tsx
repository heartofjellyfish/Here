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
// perpOffset is 0 for every ghost now. Previously small positive /
// negative values nudged each ghost slightly off the strict axis
// so the chain wouldn't look like a ruler-drawn line of beads —
// but that also meant the axis streak visibly *didn't* pass through
// ghost centers (user feedback: "没有穿成一串"). Staying strictly on
// axis is the more important read: you can see the whole chain is
// one physical line through the sun and the optical center. The
// shimmer the offsets were providing is already covered by the
// per-ghost alpha wobble and size wobble.
const GHOSTS: GhostDef[] = [
  { t: 0.22, size: 2, hue: "255, 253, 240", kind: "glint", blur: 0.6, alphaPhase: 0.0, perpOffset: 0, defocusResponse: 0.25, sizePhase: 0.2 },
  { t: -0.3, size: 7, hue: "255, 230, 180", kind: "ring", blur: 1.8, alphaPhase: 1.6, perpOffset: 0, defocusResponse: 1.4, sizePhase: 2.0 },
  { t: -0.5, size: 13, hue: "255, 215, 155", kind: "anchor", blur: 3.2, alphaPhase: 2.4, perpOffset: 0, defocusResponse: 1.4, sizePhase: 3.3 },
  { t: -0.68, size: 6, hue: "205, 220, 235", kind: "disc", blur: 1.8, alphaPhase: 3.3, perpOffset: 0, defocusResponse: 0.8, sizePhase: 4.1 },
  { t: -0.9, size: 9, hue: "255, 188, 122", kind: "disc", blur: 2.6, alphaPhase: 4.5, perpOffset: 0, defocusResponse: 0.35, sizePhase: 0.7 },
  { t: -1.15, size: 7, hue: "255, 172, 108", kind: "disc", blur: 2.0, alphaPhase: 5.4, perpOffset: 0, defocusResponse: 0.9, sizePhase: 5.6 },
  { t: -1.5, size: 4.5, hue: "255, 155, 92", kind: "disc", blur: 1.3, alphaPhase: 0.4, perpOffset: 0, defocusResponse: 0.6, sizePhase: 2.8 },
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

      // True perpendicular to the optical axis, derived from the
      // current sun direction. Previously perpOffset was applied as
      // a fixed (+x, 0.4*+y) shift — not actually perpendicular —
      // so as the sun swung from lower-left up to zenith and over
      // to upper-right, the chain's sideways jitter stayed locked
      // to screen-x. That broke the "all ghosts lie on the same
      // ray from the sun" read: the chain appeared to drift off the
      // sun's axis. Now the jitter is always perpendicular to the
      // current axis, so the chain stays visually tethered to the
      // sun no matter where the sun is.
      const sunLen = Math.hypot(rawSx, rawSy);
      const axisUnitX = sunLen > 0.01 ? rawSx / sunLen : 1;
      const axisUnitY = sunLen > 0.01 ? rawSy / sunLen : 0;
      // Rotate 90° to get perpendicular direction.
      const perpUnitX = -axisUnitY;
      const perpUnitY = axisUnitX;

      for (let i = 0; i < GHOSTS.length; i++) {
        const g = GHOSTS[i];
        const el = ghostRefs.current[i];
        if (!el) continue;

        // Ghost position = opticalCenter + t · (sun - opticalCenter).
        // With the optical center drifting as (camX, camY), this
        // expands to camCoord · (1 - t) + t · sunCoord — meaning
        // far-from-center ghosts parallax *more* than near ones,
        // which is exactly what real off-axis elements do.
        // perpOffset is applied along the true perpendicular to the
        // axis (see sunLen / perpUnit calc above) so the chain stays
        // on-axis as the sun moves.
        const gx = camX * (1 - g.t) + g.t * rawSx + g.perpOffset * perpUnitX;
        const gy = camY * (1 - g.t) + g.t * rawSy + g.perpOffset * perpUnitY;

        // Size driven by three sources so the chain doesn't inflate
        // in lockstep:
        //   1. rise-growth: during the rise portion, visible size
        //      tracks envelope — at the very start of the window
        //      ghosts are half their base size, growing to full by
        //      peak. Without this, the moment the envelope first
        //      crosses zero the anchor already appears at its
        //      multi-tens-of-vw scale (defocus is high on rise
        //      too, because sun distance drops fast), reading as
        //      "a huge faint ring floating in the sky" instead of
        //      a flare artifact coalescing with the light. Post-
        //      peak the factor stays at 1 so the slow fade is
        //      driven by alpha alone, not size collapse.
        //   2. defocus × per-ghost response × global defocus gain.
        //      Global gain 2.5 makes near-axis bloom dramatic (the
        //      "奇观" moment when the lens stares into the source).
        //      Per-ghost response picks who swells most: anchor and
        //      ring pump hard, glint stays crisp.
        //   3. per-ghost size wobble on its own sine phase — gives
        //      each reflection its own breath independent of the
        //      sun's position. Small amplitude so it reads as
        //      shimmer, not jitter.
        const riseGrowth =
          cyclePct < FLARE_WINDOW_PEAK ? 0.5 + envelope * 0.5 : 1;
        const sizeWobble =
          1 + 0.07 * Math.sin(g.sizePhase + cyclePct * 0.11);
        // Size is now gated by defocus as well as riseGrowth:
        //   defocusScale = 0.25 + defocus * 0.75
        // When the sun is far off-axis (defocus near 0), every ghost
        // shrinks to 25% of what the raw (1 + defocus*response*2.5)
        // formula would give — so the chain reads as a row of small
        // points strung along the axis, not a procession of giant
        // rings overlapping each other. As the sun approaches center
        // (defocus → 1) the ghosts bloom to full. Matches the user
        // guidance "在升起的时候把全放小一点，直到快到中心了才慢慢变大".
        const defocusScale = 0.25 + defocus * 0.75;
        const scale =
          riseGrowth *
          defocusScale *
          (1 + defocus * g.defocusResponse * 2.5) *
          sizeWobble;

        // Alpha wobble: per-ghost sine so each one breathes at
        // its own phase. Range 0.8–1.0, so ghosts never go to
        // zero from wobble alone — only the envelope drives them
        // fully dark.
        const wobble =
          0.9 + 0.1 * Math.sin(g.alphaPhase + cyclePct * 0.14);

        // Defocus gain on alpha: reflections "gather" more light when
        // the source is near the optical axis — same photons funnel
        // through a tighter bundle of reflection paths, so the ghosts
        // read noticeably brighter at center-crossing. Off-axis (far
        // from center) this stays at 1.0; on-axis it boosts 1.6×. The
        // sun itself also brightens at center (atmospheric extinction
        // is minimal when it's overhead), so the ghosts tracking that
        // crescendo is physically consistent.
        const centerGain = 1 + defocus * 0.6;

        const alpha = globalAlpha * wobble * centerGain;

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
          // Core fill tracks defocus: at dead-center the whole aperture
          // is lit on-axis and the reflection forms through the full
          // opening → the donut collapses into a nearly solid iris
          // bloom. Coefficient bumped from 0.55 to 0.9 so peak reads
          // as "filled disc with a faint rim" instead of "half-lit
          // donut". Off-axis it still hollows out to 0.05, preserving
          // the ring read when the sun is far from center.
          const coreAlpha = 0.05 + defocus * 0.9;
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
        // Alpha breathing: three incommensurate sines layered so the
        // overall brightness never lands on the same value twice in
        // the same window — reads as the atmosphere itself shifting
        // in density, not as a CSS animation on a timer. Amplitudes
        // sum to ~±0.25 of the base, enough to be felt but never
        // strong enough to read as flicker. Base alpha dropped from
        // 0.35 to 0.28 so the peak of the breath lands around the
        // old cap rather than above it.
        const rayBreath =
          1 +
          0.12 * Math.sin(now * 0.00031) +
          0.09 * Math.sin(now * 0.00073 + 1.7) +
          0.06 * Math.sin(now * 0.0013 + 3.1);
        const rayAlpha = rayEnv * 0.28 * rayBreath;
        // Rays fan omnidirectionally from the sun. Rotation is a
        // slow continuous drift (~360°/min) *plus* a small wobble
        // on an independent sine so it doesn't feel like a steady
        // spin — gives the strands a little "current" as if they're
        // drifting in air.
        const rayRot =
          (now * 0.006 + 8 * Math.sin(now * 0.00047)) % 360;
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
      {/* Turbulence filter for god rays — breaks the clean
          repeating-conic-gradient shafts into fuzzy, variable-length
          strands. Without it the rays read as uniform spokes, very
          CSS-obvious. With it they read as light scattering through
          uneven atmosphere — which is the actual physics.
          baseFrequency is anisotropic (low X, high Y) to make the
          noise streaky rather than granular, so the displacement
          elongates strands along the local ray direction instead of
          dotting them with uniform speckle. Scale kept modest (18)
          so the cone shape still reads as a cone and doesn't melt
          into abstract noise. */}
      <svg
        aria-hidden="true"
        width="0"
        height="0"
        style={{ position: "absolute", pointerEvents: "none" }}
      >
        {/* Two-stage turbulence: a low-frequency warp bends whole
            swaths of rays into curved, watery drifts; a higher-
            frequency displacement breaks those drifts into
            variable-length fuzzy strands. Stacking the two gives
            the "迷离" quality — individual rays aren't identifiable,
            the whole field reads as atmospheric scatter rather
            than a pinwheel. */}
        <filter id="sun-flare-rays-turbulence">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.04"
            numOctaves="2"
            seed="7"
            result="bigNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="bigNoise"
            scale="55"
            xChannelSelector="R"
            yChannelSelector="G"
            result="warped"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.03 0.7"
            numOctaves="2"
            seed="4"
            result="fineNoise"
          />
          <feDisplacementMap
            in="warped"
            in2="fineNoise"
            scale="28"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
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
