# 我累了

A quiet place, not a product.

One screen. A lonely rotating earth. The phrase **我累了**. A single **+1**.
Tap it and a warm, sparse line appears. Nothing else happens.

## Run

```bash
npm install
npm run dev
# open http://localhost:3000 on a phone (or resize a desktop browser to ~400px)
```

The SQLite file is created at `data/here.db` on first request.

## Structure

```
src/
  app/
    layout.tsx           font + theme color
    page.tsx             the one screen (loading → idle → revealed)
    globals.css          the whole visual system
    api/
      tap/route.ts       POST  +1, updates aggregates, returns recent5m
      presence/route.ts  GET   recent-5min tap count
  components/
    Earth.tsx            procedural canvas sphere, ~120s rotation, 20fps
    TapButton.tsx        the only interaction
  lib/
    db.ts                sqlite bootstrap, recordTap, recentCount
    geo.ts               country from x-vercel-ip-country / cf-ipcountry
    copy.ts              post-tap copy (chosen variant + candidates)
```

## Schema

- `taps(id, created_at_ms, country, day)` — raw event log, indexed on time + day.
- `daily_global(day, count)` — fast daily totals.
- `daily_country(day, country, count)` — per-country aggregates.
- `themes(week, title, note)` — reserved for optional future weekly themes.

Aggregates are updated inside the same transaction as the `taps` insert.

## 9pm resonance

There is no scheduler, no push, no countdown. `copy.ts` contains a single
observational line — "每晚 9 点，这里会更近一点。" — shown *after* a tap, once.
The sense of closeness at 9pm emerges naturally from the recent-5min count
rising as people converge; the copy only names it.

## What is deliberately missing

No feed. No profile. No login. No streaks. No notifications. No share buttons.
No analytics. No reload nudges. No "you tapped N days in a row." If any of
those feel tempting later, re-read the brief.

## Deploy

Vercel works out of the box. For persistent SQLite, deploy on a host with a
writable filesystem (Fly.io, Render, a small VPS). On Vercel, swap `lib/db.ts`
for a Postgres or Turso client — the surface is tiny (`recordTap`, `recentCount`).
