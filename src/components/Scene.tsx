"use client";

import { useEffect, useRef, useState } from "react";
import Earth, {
  type Home,
  type Ritual,
  type Witness,
  type WitnessTiming,
} from "./Earth";
import Starfield from "./Starfield";
import SunFlare from "./SunFlare";
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

type WitnessResponse = {
  taps: { country: string; createdAtMs: number }[];
  now: number;
};

// ---- Witness mode timing ----
// After the user's own ritual ends, the client polls /api/witness to
// find out where else in the world people are tapping, and lights each
// one up as a small, slow bloom on the globe. This is the "我们在一起"
// part of the experience — you tapped, now you sit and witness others.
const WITNESS_POLL_MS = 5_000;
// Each returned tap is scheduled somewhere inside this window after
// receipt, proportional to its real timestamp, so a batch never blooms
// all at once. "万家灯火各有各的 rhythm" — each point has its own beat.
const WITNESS_STAGGER_MS = 4_500;
// Minimum spacing and small jitter so two taps at the same server
// moment don't land on exactly the same client tick.
const WITNESS_MIN_DELAY_MS = 200;
const WITNESS_JITTER_MS = 600;

// Per-bloom lifecycle defaults. Each bloom rises to full brightness,
// holds, then fades. Overridable via ?rise=&hold=&fade= URL params
// (values in seconds) — lets us preview "stays lit longer" or "quick
// glints" without code changes. Defaults match the hand-tuned values
// the ritual was designed around.
const DEFAULT_TIMING: WitnessTiming = {
  riseMs: 1500,
  holdMs: 6000,
  fadeMs: 20000,
};

function lifetimeOf(t: WitnessTiming): number {
  return t.riseMs + t.holdMs + t.fadeMs;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ---- Ritual timing ----
// After the user taps, the phrase wisps into the earth and the ritual
// begins:
//   SNAP     earth eases to the user's own country and ignites it
//   IGNITE   earth holds still for a beat — the user's point alone on
//            the globe, giving the "+1" a small ceremony instead of
//            rushing into the sweep
//   SWEEP    one slow full turn; every other recent country lights as
//            it passes beneath the meridian
//   RETURN   sweep ends right back at the user's point (by construction)
//   FLASH    earth holds; the entire universe flashes for 2 seconds
//   FADE     all lights dim together, earth resumes its idle rotation
const DISSOLVE_MS = 1600;
const SNAP_MS = 1400;
const IGNITE_MS = 1000;
const SWEEP_MS = 5000;
const FLASH_MS = 2000;
const FADE_MS = 1000;

export default function Scene({ lang }: { lang: Lang }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [ritual, setRitual] = useState<Ritual | null>(null);
  const [flashAt, setFlashAt] = useState<number | null>(null);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  // When the user's ritual has resolved and witness mode begins. Null
  // before the tap — polling only starts after the user has been seen
  // themselves, so the emotional order is "you are heard" first, then
  // "you can hear others."
  const [witnessActiveAt, setWitnessActiveAt] = useState<number | null>(null);
  // The user's own tap, pinned as a permanent amber dot once the
  // ritual fades. Null before the tap; set at the handoff into
  // witness mode so it inherits the exact moment the ritual ends.
  const [home, setHome] = useState<Home | null>(null);
  // Earth canvas size — picked once at mount from viewport width so it
  // never overflows on narrow phones. Includes margin for the moon orbit.
  const [earthSize, setEarthSize] = useState(340);

  const earthRef = useRef<HTMLDivElement>(null);
  const phraseRef = useRef<HTMLHeadingElement>(null);
  const tapWrapRef = useRef<HTMLDivElement>(null);

  // URL-driven preview knobs. Parsed once at mount via lazy state init
  // so there's no hydration flicker and no re-render storm from param
  // changes (they can't change at runtime anyway — it's URL-on-load).
  //
  // Supported params:
  //   ?sim=N     — pretend N synthetic taps/sec are coming in (0-200)
  //   ?rise=S    — per-bloom rise seconds
  //   ?hold=S    — per-bloom hold-at-full seconds
  //   ?fade=S    — per-bloom fade seconds
  //
  // Defaults produce the intended poetic pace for organic traffic.
  // For busy simulation (sim=50+), try something shorter so the
  // globe twinkles instead of saturating, e.g. hold=1&fade=3.
  const [cfg] = useState<{ simQps: string | null; timing: WitnessTiming }>(
    () => {
      if (typeof window === "undefined") {
        return { simQps: null, timing: { ...DEFAULT_TIMING } };
      }
      const p = new URLSearchParams(window.location.search);
      const sim = p.get("sim");
      const simQps = sim && /^\d+$/.test(sim) ? sim : null;
      const readSec = (key: string, defMs: number) => {
        const v = p.get(key);
        if (v == null) return defMs;
        const n = parseFloat(v);
        // Accept 0 (instant) up to 5 min (300s). Anything crazier
        // is almost certainly a typo and we'd rather ignore it.
        if (!Number.isFinite(n) || n < 0 || n > 300) return defMs;
        return Math.round(n * 1000);
      };
      return {
        simQps,
        timing: {
          riseMs: readSec("rise", DEFAULT_TIMING.riseMs),
          holdMs: readSec("hold", DEFAULT_TIMING.holdMs),
          fadeMs: readSec("fade", DEFAULT_TIMING.fadeMs),
        },
      };
    },
  );
  const lifetimeMs = lifetimeOf(cfg.timing);

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
        snapMs: SNAP_MS,
        igniteMs: IGNITE_MS,
        sweepMs: SWEEP_MS,
        flashMs: FLASH_MS,
        fadeMs: FADE_MS,
      });
      // Flash fires the moment the sweep completes and the camera
      // lands back on the user's point. The earth holds still for the
      // full 2 seconds of the flash before the fade begins.
      setFlashAt(startAt + SNAP_MS + IGNITE_MS + SWEEP_MS);
      setPhase("revealed");

      // Let Earth drive the ritual off the canvas. Once the fade has
      // settled, clear the ritual so the component returns to its idle
      // loop — the rotation keeps rolling, no highlights, no snap.
      // At the same moment, flip into witness mode (the globe stops
      // being about the user, starts being about everyone else) and
      // plant the user's home dot so their point stays lit permanently.
      // No safety buffer after fade — the fade ends cleanly on the
      // animation clock, waiting longer just reads as a dead beat.
      setTimeout(() => {
        setRitual(null);
        const handoffAt = Date.now();
        if (primaryCountry) {
          // Seed the home dot with the ritual's startAt (not the
          // handoff moment). Earth uses seedFor(home.startAt, country)
          // to pick the jittered land position; matching the ritual's
          // seed guarantees the home dot lands on the exact same
          // pixel the primary was lit on — no visible jump.
          setHome({ country: primaryCountry, startAt: startAt });
        }
        setWitnessActiveAt(handoffAt);
      }, SNAP_MS + IGNITE_MS + SWEEP_MS + FLASH_MS + FADE_MS);
    }, DISSOLVE_MS);
  }

  // Witness stream. Polls /api/witness every few seconds; each returned
  // tap is scheduled to bloom at an offset proportional to its real
  // server timestamp within the polling window — so a burst of 3 real
  // taps in one interval blooms spread out over 5s rather than in
  // lockstep on every 5th second. The server also mixes in ambient
  // synthetic taps at a slow steady cadence when real traffic is
  // sparse (see WITNESS_AMBIENT env var), so the globe has a pulse
  // even on a quiet day.
  useEffect(() => {
    if (witnessActiveAt == null) return;

    // Anchor the "since" cursor to the server's clock, not ours —
    // each /api/witness response returns the server's `now`, which
    // becomes the next poll's `since`. This keeps client/server drift
    // from ever causing a dropped or duplicated event.
    let serverSince = witnessActiveAt;
    const pendingTimers = new Set<number>();
    let intervalId: number | null = null;
    let inFlight = false;

    async function poll() {
      if (document.hidden) return;
      if (inFlight) return;
      inFlight = true;
      try {
        const simParam = cfg.simQps ? `&sim=${cfg.simQps}` : "";
        const res = await fetch(
          `/api/witness?since=${serverSince}${simParam}`,
        );
        if (!res.ok) return;
        const data: WitnessResponse = await res.json();
        const windowStart = serverSince;
        const windowEnd = data.now;
        serverSince = windowEnd;
        const span = Math.max(1, windowEnd - windowStart);

        for (const tap of data.taps) {
          // Map server timestamp → client delay. A tap that happened
          // right at windowStart blooms almost immediately; one near
          // windowEnd waits close to a full STAGGER window. Jitter
          // keeps two "simultaneous" taps from visually colliding.
          const rel = Math.max(
            0,
            Math.min(1, (tap.createdAtMs - windowStart) / span),
          );
          const delay =
            WITNESS_MIN_DELAY_MS +
            rel * WITNESS_STAGGER_MS +
            rand(0, WITNESS_JITTER_MS);
          const id = `${tap.country}-${tap.createdAtMs}`;
          const timer = window.setTimeout(() => {
            pendingTimers.delete(timer);
            setWitnesses((prev) => {
              if (prev.some((w) => w.id === id)) return prev;
              const next = prev.concat({
                id,
                country: tap.country,
                appearAt: Date.now(),
              });
              // Drop anything that's already past its lifetime so the
              // list doesn't grow unbounded on long sessions.
              const cutoff = Date.now() - lifetimeMs;
              return next.filter((w) => w.appearAt > cutoff);
            });
          }, delay);
          pendingTimers.add(timer);
        }
      } catch {
        // Swallow — we'll try again on the next interval.
      } finally {
        inFlight = false;
      }
    }

    function start() {
      if (intervalId != null) return;
      // Kick a poll immediately so witness mode begins lighting up
      // right at the handoff instead of waiting up to 5s for the first
      // interval tick. Stale events aren't a concern: `serverSince`
      // was set to the ritual-end moment, so `tapsSince` returns
      // nothing from before that point.
      void poll();
      intervalId = window.setInterval(poll, WITNESS_POLL_MS);
    }
    function stop() {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    start();

    const onVis = () => {
      if (document.hidden) {
        stop();
      } else {
        // Don't flood with everything that happened while hidden —
        // reset the cursor so we only bloom events from here forward.
        serverSince = Date.now();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      pendingTimers.forEach((t) => window.clearTimeout(t));
      pendingTimers.clear();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [witnessActiveAt]);

  // GC: drop witnesses whose blooms have finished. Separate from the
  // poll loop so it ticks even when no new taps are arriving, keeping
  // the prop stable-small for Earth.
  useEffect(() => {
    if (witnessActiveAt == null) return;
    const id = window.setInterval(() => {
      const cutoff = Date.now() - lifetimeMs;
      setWitnesses((prev) =>
        prev.some((w) => w.appearAt <= cutoff)
          ? prev.filter((w) => w.appearAt > cutoff)
          : prev,
      );
    }, 3_000);
    return () => window.clearInterval(id);
  }, [witnessActiveAt, lifetimeMs]);

  const stagger = phraseIsStaggered(lang);

  return (
    <>
      <Starfield flashAt={flashAt} earthSize={earthSize} />
      <div className="sun-glow" aria-hidden="true" />
      <SunFlare />
      <main className={`stage stage--${phase} ${fontClass}`} dir={dir}>
        <div ref={earthRef} className="earth-wrap">
          <Earth
            size={earthSize}
            ritual={ritual}
            witnesses={witnesses}
            witnessTiming={cfg.timing}
            home={home}
          />
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
          <p className="reveal__coda">{copy.coda}</p>
        </div>
      </main>
      <Grain />
    </>
  );
}
