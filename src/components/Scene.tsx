"use client";

import { useEffect, useRef, useState } from "react";
import Earth, { type Ritual } from "./Earth";
import Starfield from "./Starfield";
import TapButton from "./TapButton";
import Grain from "./Grain";
import {
  COPY,
  isRTL,
  langFontClass,
  phraseIsStaggered,
  type Lang,
} from "@/lib/i18n";

type Phase = "loading" | "idle" | "dissolving" | "revealed";

type TapResponse = {
  ok: boolean;
  country?: string | null;
  recent5m?: number;
  recentCountries?: string[];
};

// ---- Ritual timing ----
// After the user taps, the phrase wisps into the earth, the earth
// performs a one-and-a-half-turn sweep lighting every recent country as
// it passes beneath the meridian, stops on the user's own country with
// the brightest point, holds, fades, and resumes rotation. At the same
// moment the primary point blooms, the whole universe flashes once —
// the sky, quietly, cheering the person on.
const DISSOLVE_MS = 1600;
const SWEEP_MS = 3600;
const HOLD_MS = 1000;
const FADE_MS = 800;

export default function Scene({ lang }: { lang: Lang }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [ritual, setRitual] = useState<Ritual | null>(null);
  const [flashAt, setFlashAt] = useState<number | null>(null);
  // Earth canvas size — picked once at mount from viewport width so it
  // never overflows on narrow phones. Includes margin for the moon orbit.
  const [earthSize, setEarthSize] = useState(340);

  const earthRef = useRef<HTMLDivElement>(null);
  const phraseRef = useRef<HTMLHeadingElement>(null);
  const tapWrapRef = useRef<HTMLDivElement>(null);

  const copy = COPY[lang];
  const fontClass = langFontClass(lang);
  const dir = isRTL(lang) ? "rtl" : "ltr";

  // Settle the earth before the text fades in.
  useEffect(() => {
    const t = setTimeout(() => setPhase("idle"), 600);
    return () => clearTimeout(t);
  }, []);

  // Pick a comfortable earth size: ~80% of the viewport's shortest side,
  // capped so it doesn't dominate larger screens.
  useEffect(() => {
    const s = Math.min(window.innerWidth, window.innerHeight);
    setEarthSize(Math.max(280, Math.min(380, Math.round(s * 0.78))));
  }, []);

  // Compute the wisp trajectory from the phrase/button center to the earth
  // center, in pixels. Set as CSS vars so the dissolve animation knows
  // exactly where to send them.
  function applyWispVector() {
    const earthEl = earthRef.current;
    const phraseEl = phraseRef.current;
    const tapEl = tapWrapRef.current;
    if (!earthEl) return;
    const eRect = earthEl.getBoundingClientRect();
    const eCx = eRect.left + eRect.width / 2;
    const eCy = eRect.top + eRect.height / 2;
    for (const el of [phraseEl, tapEl]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dx = eCx - (r.left + r.width / 2);
      const dy = eCy - (r.top + r.height / 2);
      el.style.setProperty("--wisp-dx", `${dx}px`);
      el.style.setProperty("--wisp-dy", `${dy}px`);
    }
  }

  async function handleTap() {
    if (phase !== "idle") return;
    applyWispVector();
    setPhase("dissolving");

    // Fire the network call in parallel with the dissolve.
    const tapPromise = fetch("/api/tap", { method: "POST" })
      .then((r) => r.json() as Promise<TapResponse>)
      .catch(() => ({ ok: false } as TapResponse));

    setTimeout(async () => {
      const data = await tapPromise;
      const startAt = Date.now();
      const primaryCountry = data.country ?? null;

      // Build the country list: primary first (so it leads the render),
      // then the recent chorus. Earth will compute each country's
      // light-up time from the sweep geometry.
      const countries: string[] = [];
      if (primaryCountry) countries.push(primaryCountry);
      if (data.recentCountries) {
        for (const c of data.recentCountries) {
          if (primaryCountry && c === primaryCountry) continue;
          countries.push(c);
        }
      }

      setRitual({
        startAt,
        primaryCountry,
        countries,
        sweepMs: SWEEP_MS,
        holdMs: HOLD_MS,
        fadeMs: FADE_MS,
      });
      // Universe flash peaks as the primary point blooms (near sweep end).
      // Scheduling slightly *before* the bloom lets the flash rise and
      // meet the light instead of following behind it.
      setFlashAt(startAt + SWEEP_MS - 200);
      setPhase("revealed");

      // Let Earth drive the ritual off the canvas. Once the fade has
      // settled, clear the ritual so the component returns to its idle
      // loop — the rotation keeps rolling, no highlights, no snap.
      setTimeout(() => {
        setRitual(null);
      }, SWEEP_MS + HOLD_MS + FADE_MS + 400);
    }, DISSOLVE_MS);
  }

  const stagger = phraseIsStaggered(lang);

  return (
    <>
      <Starfield flashAt={flashAt} />
      <div className="sun-glow" aria-hidden="true" />
      <main className={`stage stage--${phase} ${fontClass}`} dir={dir}>
        <div ref={earthRef} className="earth-wrap">
          <Earth size={earthSize} ritual={ritual} />
        </div>

        <h1
          ref={phraseRef}
          className="phrase"
          aria-label={copy.phrase}
        >
          {stagger
            ? Array.from(copy.phrase).map((c, i) => (
                <span
                  key={i}
                  className="phrase__char"
                  style={
                    {
                      "--char-delay": `${300 + i * 220}ms`,
                    } as React.CSSProperties
                  }
                >
                  {c}
                </span>
              ))
            : (
                <span
                  className="phrase__char"
                  style={{ "--char-delay": "300ms" } as React.CSSProperties}
                >
                  {copy.phrase}
                </span>
              )}
        </h1>

        <div ref={tapWrapRef} className="tap-wrap" aria-hidden={phase !== "idle"}>
          <TapButton disabled={phase !== "idle"} onTap={handleTap} />
        </div>

        <div className="reveal" role="status" aria-live="polite">
          <p className="reveal__ack">
            {copy.ack[0]}
            <span className="reveal__ack-sub">{copy.ack[1]}</span>
          </p>
        </div>
      </main>
      <Grain />
    </>
  );
}
