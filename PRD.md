# Product Requirements Document: 我累了

_Owner: Product & Business (single voice — they can't disagree on this one.)_
_Status: v1 (pre-launch)_
_Last reviewed: 2026-04-14_

---

## 1. Core thesis

> *Somewhere in the world, right now, someone else is tired too.*

Modern digital products optimize for return. They compete for attention, shape behavior into streaks, dress stimulation as connection. The result is a quiet epidemic: people feel simultaneously watched and unseen, reachable and alone.

**我累了 is the inverse.** It is a place you visit once, acknowledge a feeling, and leave — slightly less alone than you arrived. It is not a habit. It is a small, honest human gesture rendered as a web page.

This is the one sentence the product optimizes for. Every other decision defers to it.

---

## 2. Positioning

We define the product by what it is *not*, because the category it resembles most is the category it is actively refusing.

- **Not a mental health app.** Those ask you to track moods, complete sessions, return.
- **Not a social network.** Those rank people and monetize attention.
- **Not a productivity tool.** Those frame fatigue as a problem to solve.
- **Not a meditation app.** Those guide you through states and want your subscription.
- **Not a game.** No score, no progression, no loop.

**我累了 is a place, not a tool.** It does not improve you. It witnesses you.

---

## 3. Target *moment* (not target user)

We do not segment by age, geography, or behavior. We are not building a user base. We are there for a specific *moment* in anyone's life:

> The moment between the last work message and sleep.
> The 15 seconds on a bus home.
> The 11pm almost-text-someone-but-don't.

Anyone who has had that moment is our user, for 20 seconds. That is enough.

The implication for growth: **we grow by existing where that moment is, not by nudging anyone into returning to us.** The product spreads by word of mouth from people who met their moment here — or it doesn't spread, and that's also fine.

---

## 4. Principles (veto-level, not guidance)

Every proposal is checked against these. If a feature violates one, it does not ship — even if it would increase any metric.

1. **A single gesture.** One thing to do on one screen. Forever.
2. **No return pressure.** The product is designed to make return unnecessary, not impossible.
3. **No performance.** No counts to maintain, no identity, no streaks, no comparison.
4. **No novelty tricks.** No push, no countdown, no "limited", no "new."
5. **Warmth without claim.** Copy acknowledges — it never instructs, sells, or promises.
6. **Quiet by default.** Dark, slow, small. The product holds its breath in the room with you.
7. **Presence, not metrics.** "3 people in the last 5 minutes" is a whisper, not a score.

---

## 5. Anti-features (explicit no-build list)

This list is longer than our feature list. That is the point.

- Accounts, login, profiles, avatars
- Feeds, comments, replies, reactions beyond +1
- Notifications of any kind (push, email, in-app, browser)
- Streaks, badges, levels, achievements, "you've been here N days"
- Infinite scroll, "load more", pagination
- Share-to-social buttons on the main screen
- Testimonials, press logos, social proof
- Onboarding flows, tooltips, empty states, "how it works"
- Modal dialogs, toasts, banners
- Daily challenges, prompts, questions
- A/B tests on emotional copy (ethically off-limits)
- Behavioral analytics beyond aggregate taps
- Retention dashboards for internal use
- "Haven't seen you in a while" re-engagement
- Email capture of any kind
- Referral programs

If a future teammate proposes any of these, point them here.

---

## 6. Experience

### 6.1 The flow

One screen. Three micro-phases.

1. **Arrival** (0–600 ms): near-black, the earth fades in, breath-slow rotation.
2. **Acknowledgement** (600 ms → tap): the phrase 我累了 settles, then a single **+1** appears.
3. **Resonance** (after tap): the button exhales and, one sentence at a time, the room widens:
   - *此刻，也有人这样。* — you've been named.
   - *每晚 9 点，这里会更近一点。* — a small promise, no pressure.
   - *· 过去五分钟，还有 N 个人 ·* — quiet evidence.

The user may leave at any point. Nothing more will be offered.

### 6.2 The 9pm resonance

Every night, at 9pm local time, the global count drifts up. The app does nothing to cause this other than exist. **No reminder, no alarm, no scheduled event, no countdown, no push.** The user learns about it once, as an observation, and can choose — privately, without commitment — to remember it.

This is a *feeling*, not a feature. It is engineered only by (a) the copy line, and (b) our refusal to build anything that would make it louder. The rising number in the last-5-minutes counter around 9pm is the only mechanical signal, and it is not framed as one.

### 6.3 Platform

Mobile-first web. No app store. No install. No account. A URL is enough.

---

## 7. Success metrics

Conventional engagement metrics are **inverted incentives** here. High session time, high returns, and high daily-actives would all signal failure of the core thesis. We measure instead:

### Primary — reach of moments

- **Unique visitors who tapped at least once.** Weekly, monthly. We want many people to find us *once*.
- **Countries represented per 24h.** Proof that "not alone" is literal.

### Secondary — resonance shape

- **9pm amplification ratio**: taps in 20:00–22:00 local / 24h hourly average. Target ≥ 1.6×. This is evidence the resonance concept landed *without us forcing it*.
- **Median taps per unique visitor**: expected ~1. **If this exceeds 2, we have accidentally built a compulsion and must investigate.**

### Non-metrics (explicitly refused)

- DAU/WAU/MAU retention curves
- Session length
- Time-on-screen past the tap
- Conversion funnels
- "Power users"

### Qualitative

- Unsolicited shares (screenshots, posts) in the wild
- Press that describes the *feeling*, not the *feature*

---

## 8. Business model

This is primarily a **cultural artifact**, not a revenue product. That stance is load-bearing: **the moment the product owes anyone money, it will be asked to optimize for engagement, and the thesis will die.**

Sustainable options, in order of tone-fit:

1. **Patronage** — a single quiet "支持这里" link on a secondary page (never the main screen). Optional one-off donations via Stripe / Buy Me a Coffee. Pays hosting and a modest stipend.
2. **Annual artifact** — a minimal printed volume each year ("2026: 累") turning aggregate taps into visual poetry. Sold once via an adjacent site. Self-funded print run.
3. **Explicit refusal** — sponsors, ads, brand partnerships, affiliate links, "wellness" cross-promotion, data sales. Never.

**If revenue requirements exceed patronage, the correct response is to reduce cost, not add features.** Hosting this can run < $20/month on a small VPS at meaningful scale.

---

## 9. Risks

| Risk | Severity | Response |
|---|---|---|
| Drift into engagement features under growth pressure | **High** | This PRD. Principles are veto-level. |
| Abusive bots inflating counts | Medium | Aggregate-only display; per-IP rate limit (1 tap / 60s); no leaderboard to game. |
| Cultural misread outside CN context | Medium | Stay Chinese-only on v1. Localize only with a native poet, never a tool. |
| Misuse as a crisis touchpoint | **High** | Add a single unobtrusive link on a secondary `/about` page to local crisis resources. Do **not** make the main screen a triage surface — that would betray the tone. |
| Journalist or brand wants to "partner" | Medium | Polite no. See §8. |
| Copycats | Low | They will optimize for engagement and lose the thesis. Let them. |

---

## 10. Roadmap principles

Anything shipped in v2+ must pass **all three**:

1. **Could the product exist without this?** If yes, don't ship it.
2. **Does it invite the user to stay longer, return sooner, or do more?** If yes, reject.
3. **Does it make the room quieter, or louder?** Ship only if quieter.

### Tentative v2 candidates (all optional)

- `/about` — one paragraph. A crisis line link. No CTA, no sign-up.
- **Weekly theme** — a single word per week (*累*, *想念*, *久*), visible only after you've tapped. Schema already supports it.
- **Localization** — Japanese and English, translated by poets, not tools.
- **Print artifact (2026)** — aggregate taps rendered as a 32-page booklet. Print once. Sell once. Don't repeat mechanically.

### Deferred forever unless the thesis changes

Sound, images, video, any second screen, any second gesture, any account system.

---

## 11. Definition of done for v1

- One page loads on a mid-range phone in under 2 seconds over 4G.
- The full loading → idle → revealed arc works without any input other than +1.
- Aggregate counts persist across restarts.
- A user who lands, taps, and leaves within 30 seconds has had a complete experience.
- There is nothing on the screen a first-time visitor needs explained.
