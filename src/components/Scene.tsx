"use client";

import { useEffect, useRef, useState } from "react";
import Earth, { type EarthHighlight } from "./Earth";
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

const DISSOLVE_MS = 2400;
/**
 * How long to wait, after the highlight array is set, before the glow
 * actually renders. The Earth kicks off its rotation snap the moment a
 * new primary highlight appears, so scheduling `startedAt` this far in
 * the future means the camera finishes sweeping to the country *before*
 * the light blooms — you see the point get lit, not arrive already-lit.
 * Tuned against the snap easing (0.05/frame → ~98.6% settled by 1400ms).
 */
const ROTATION_SETTLE_MS = 1400;

export default function Scene({ lang }: { lang: Lang }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [recent5m, setRecent5m] = useState(0);
  const [highlights, setHighlights] = useState<EarthHighlight[]>([]);
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

  // After reveal, refresh presence + resonance every 45s. No animation on
  // updates — the earth lights up new countries, the number changes silently.
  useEffect(() => {
    if (phase !== "revealed") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        const data = (await res.json()) as TapResponse;
        if (cancelled) return;
        if (typeof data.recent5m === "number") setRecent5m(data.recent5m);
        if (Array.isArray(data.recentCountries)) {
          setHighlights((prev) => {
            const primary = prev.find((h) => h.primary);
            const now = Date.now();
            const resonance = data.recentCountries!
              .filter((c) => !primary || c !== primary.country)
              .map<EarthHighlight>((c, i) => ({
                country: c,
                primary: false,
                startedAt: now + i * 350 + Math.random() * 600,
              }));
            return primary ? [primary, ...resonance] : resonance;
          });
        }
      } catch {
        /* stay quiet */
      }
    };
    const id = setInterval(tick, 45_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase]);

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

      if (typeof data.recent5m === "number") setRecent5m(data.recent5m);

      const next: EarthHighlight[] = [];
      const now = Date.now();

      // Earth rotates to the user's country the moment we hand it the
      // primary highlight, but we hold off on actually *lighting* it until
      // the camera has swept into place — otherwise the country arrives
      // already-lit, robbing the moment of its little "ignition."
      const litAt = now + ROTATION_SETTLE_MS;

      if (data.country) {
        next.push({ country: data.country, primary: true, startedAt: litAt });
      }
      if (data.recentCountries) {
        for (const c of data.recentCountries) {
          if (data.country && c === data.country) continue;
          next.push({
            country: c,
            primary: false,
            // Resonance pulses follow the user's own light, staggered.
            startedAt: litAt + 700 + Math.random() * 1800,
          });
        }
      }
      setHighlights(next);
      setPhase("revealed");
    }, DISSOLVE_MS);
  }

  const presence = recent5m > 0 ? copy.presenceFmt(recent5m) : "";
  const stagger = phraseIsStaggered(lang);

  return (
    <>
      <Starfield />
      <div className="sun-glow" aria-hidden="true" />
      <main className={`stage stage--${phase} ${fontClass}`} dir={dir}>
        <div ref={earthRef} className="earth-wrap">
          <Earth size={earthSize} highlights={highlights} />
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
          <p className="reveal__ack">{copy.ack}</p>
          <p className="reveal__resonance">{copy.resonance}</p>
          <p className="reveal__presence">{presence || "\u00A0"}</p>
        </div>
      </main>
      <Grain />
    </>
  );
}
