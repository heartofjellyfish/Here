# 我累了 / I'm tired.

A quiet place, not a product.

One screen. A rotating earth. A phrase in the visitor's language. A single **+1**.
Tap it and the earth acknowledges you, sweeps through other countries where people have
tapped recently, flashes — then settles into witness mode, where you sit and watch others.

---

## What happens

**Before the tap:** A dotted earth rotates slowly against a starfield. The phrase appears
in the visitor's language. If the visitor doesn't tap within 30 seconds, the prompt
fades and witness mode begins automatically.

**The tap ritual (on +1):**
1. The phrase and button wisp into the earth.
2. The earth snaps to the visitor's country and ignites it.
3. One slow full rotation — every other recently-tapped country lights as it passes front.
4. A brief flash. The earth holds still.
5. The reveal text appears: the acknowledgement ("You're not alone.") then the collective
   coda ("We're not alone.").
6. The earth slides to viewport center. Witness mode begins.

**Witness mode:** The globe polls for real taps elsewhere in the world, blooming each
one as a small light. Synthetic ambient taps fill the globe on quiet days so it always
feels alive. The visitor's own tap remains as a permanent amber dot.

**The sun cycle (153s):** A physically-modelled sunrise/sunset arc crosses the viewport
on every page load. Near zenith (at the visitor's earth center), the full lens-flare
system is active: a 7-ghost chain on the optical axis, a diffraction starburst,
volumetric god rays, a peak flash, and a warm golden-hour tint.

**Music:** Gymnopédie No. 1 fades in on the first tap. A mute toggle appears afterward,
with the preference persisted to `localStorage`.

---

## Run

```bash
npm install
npm run dev
# open http://localhost:3000
# resize to ~400px wide or open on a phone for the intended layout
```

The SQLite database is created at `data/here.db` on first request.

---

## Structure

```
src/
  app/
    layout.tsx              font + theme color
    page.tsx                entry point — detects language, renders Scene
    globals.css             the complete visual system
    api/
      tap/route.ts          POST /api/tap — records tap, returns recent5m + countries
      presence/route.ts     GET  /api/presence — recent-5min tap count
      witness/route.ts      GET  /api/witness — taps since a timestamp, with synthetic fill
  components/
    Scene.tsx               orchestrates all phases and timing
    Earth.tsx               procedural canvas sphere; rotation, ritual, witness blooms, home dot
    SunFlare.tsx            JS-driven lens flare, starburst, god rays, peak flash/tint
    Starfield.tsx           150 stars with parallax drift on earth-centering
    TapButton.tsx           the only interaction
    BackgroundMusic.tsx     audio fade-in/out, mute toggle, autoplay fallback
    Grain.tsx               film grain overlay
  lib/
    db.ts                   SQLite bootstrap — recordTap, recentCount, witnessTaps
    geo.ts                  country from x-vercel-ip-country / cf-ipcountry headers
    i18n.ts                 12-language copy (phrase / ack / coda) + font classes
    countries.ts            country coordinates and population hotspots for globe rendering
```

---

## Database schema

- `taps(id, created_at_ms, country, day)` — raw event log, indexed on time + day.
- `daily_global(day, count)` — fast daily totals.
- `daily_country(day, country, count)` — per-country aggregates.
- `themes(week, title, note)` — reserved for optional future weekly themes.

Aggregates are updated inside the same transaction as the `taps` insert.

---

## Localisation

Language is detected from the visitor's IP country via `lib/i18n.ts`. Supported languages:
`zh`, `en`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `ru`, `it`, `nl`, `ar`. Adding a language
requires a COPY entry, a COUNTRY_TO_LANG mapping, and a font class — nothing else.

---

## Witness mode tuning

URL parameters (for development / previewing):

| Param | Default | Effect |
|-------|---------|--------|
| `?sim=N` | 200 | Synthetic taps/sec on the witness globe. `?sim=0` shows only real taps. |
| `?rise=S` | 0.5 | Per-bloom rise duration in seconds. |
| `?hold=S` | 1.0 | Per-bloom hold duration in seconds. |
| `?fade=S` | 0.5 | Per-bloom fade duration in seconds. |

Example for a slower, more contemplative globe: `?sim=10&rise=1.5&hold=6&fade=20`.

---

## Mobile considerations

- Earth canvas sized to ~78% of the viewport's shortest side (280–380px).
- Device pixel ratio capped to keep canvas raster manageable.
- SVG turbulence filter on god rays is removed on viewports ≤900px wide; ray alpha is
  boosted in JS to compensate.
- Sun glow blur is removed on mobile via CSS media query.
- `vmax` units on sun position and ghost sizes so the arc and flare scale correctly
  on portrait viewports.

---

## What is deliberately missing

No feed. No profile. No login. No streaks. No notifications. No share buttons.
No analytics. No reload nudges. No "you tapped N days in a row." If any of
those feel tempting later, re-read the brief.

---

## Deploy

Vercel works out of the box for a stateless preview. For persistent SQLite, deploy on a
host with a writable filesystem (Fly.io, Render, a small VPS). On Vercel, swap `lib/db.ts`
for a Postgres or Turso client — the surface is small (`recordTap`, `recentCount`,
`witnessTaps`).
