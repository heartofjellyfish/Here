"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Gymnopédie No. 1 (Remastered) as the ambient layer of the ritual.
 * Peaceful, not sad — the right register for witnessing. Browsers
 * won't play audio without a user gesture, so this component does
 * nothing until `play` flips true (which Scene wires to the moment
 * the user taps). The piano then fades in over 1.5s — the wisp is
 * just landing on the earth, the first chord arrives with the ignition.
 *
 * The mute toggle:
 *   • appears once the music has been triggered (not before — no point
 *     showing a control for sound that doesn't exist yet)
 *   • persists to localStorage so a returning visitor's preference
 *     survives the next session
 *   • on first visit, music is on by default (the experience the
 *     designer intends; soft fade + visible mute keeps it polite)
 */

const TARGET_VOLUME = 0.35;
const FADE_IN_MS = 1500;
const FADE_OUT_MS = 500;
const STORAGE_KEY = "music-muted";
const FADE_TICK_MS = 30;

export default function BackgroundMusic({ play }: { play: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const [muted, setMuted] = useState(false);
  // The toggle button is hidden until the first tap. Before that there
  // is no audio context to control, so a visible icon would confuse.
  const [revealed, setRevealed] = useState(false);

  // Read saved mute preference once on mount. Lazy state init would
  // cause a hydration mismatch (server has no localStorage), so we do
  // it in an effect — one extra render, but no flicker.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setMuted(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Private mode etc — keep default (unmuted).
    }
  }, []);

  function clearFade() {
    if (fadeTimerRef.current != null) {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }

  // Linear volume ramp via setInterval. Web Audio API has nicer ramps
  // but for a single bg track this is plenty — 30ms ticks are below
  // the threshold of audible stepping at this dynamic range.
  function fadeTo(target: number, durationMs: number, onDone?: () => void) {
    const audio = audioRef.current;
    if (!audio) return;
    clearFade();
    const start = audio.volume;
    if (durationMs <= 0 || start === target) {
      audio.volume = target;
      onDone?.();
      return;
    }
    const startedAt = performance.now();
    fadeTimerRef.current = window.setInterval(() => {
      const t = (performance.now() - startedAt) / durationMs;
      if (t >= 1) {
        audio.volume = target;
        clearFade();
        onDone?.();
        return;
      }
      audio.volume = start + (target - start) * t;
    }, FADE_TICK_MS);
  }

  // First-tap trigger: start playback (the tap is the gesture that
  // unlocks audio) and fade in unless the user previously chose to
  // mute. We do NOT fight `play` going false later — once the music
  // starts, it keeps going through witness mode; only the user's mute
  // toggle stops it.
  useEffect(() => {
    if (!play || revealed) return;
    setRevealed(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0;
    audio.play().catch(() => {
      // Should not happen — `play` flips true inside a click handler,
      // which counts as a gesture. Swallow rather than crash.
    });
    if (!muted) fadeTo(TARGET_VOLUME, FADE_IN_MS);
  }, [play, revealed, muted]);

  // React to mute changes after the music has been revealed. The
  // initial mute load above happens before reveal and shouldn't trigger
  // playback by itself.
  useEffect(() => {
    if (!revealed) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      fadeTo(0, FADE_OUT_MS, () => {
        // Pause to free decoder resources after the fade settles.
        if (audio.volume === 0) audio.pause();
      });
    } else {
      if (audio.paused) {
        audio.play().catch(() => {});
      }
      fadeTo(TARGET_VOLUME, FADE_IN_MS);
    }
  }, [muted, revealed]);

  useEffect(() => {
    return () => clearFade();
  }, []);

  function toggle() {
    setMuted((m) => {
      const next = !m;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures — preference just won't persist.
      }
      return next;
    });
  }

  return (
    <>
      <audio
        ref={audioRef}
        src="/audio/gymnopedie-1.mp3"
        loop
        preload="auto"
        aria-hidden="true"
      />
      {revealed && (
        <button
          type="button"
          className="music-toggle"
          aria-label={muted ? "Unmute music" : "Mute music"}
          aria-pressed={muted}
          onClick={toggle}
        >
          {muted ? (
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M3 7.5v5h3l4 3V4.5L6 7.5H3z"
                fill="currentColor"
              />
              <path
                d="M13 7l5 6m0-6l-5 6"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M3 7.5v5h3l4 3V4.5L6 7.5H3z"
                fill="currentColor"
              />
              <path
                d="M13.2 7c1.4 1.5 1.4 4.5 0 6"
                stroke="currentColor"
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M15.8 5c2.4 2.4 2.4 7.6 0 10"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="none"
                strokeLinecap="round"
                opacity="0.55"
              />
            </svg>
          )}
        </button>
      )}
    </>
  );
}
