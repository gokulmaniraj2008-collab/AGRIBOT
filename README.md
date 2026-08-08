# AgriBot AI — Phase 1 + 2

Design system, navigation shell, landing page, and the main dashboard with
a demo-data service. This is still a scoped slice, not the full spec —
and it is a separate prototype from the "agribot-dashboard" project you
already have in your GitHub codespace (different, real, Supabase-backed
app). Nothing here has been merged with that project.

## What's actually built and verified

Everything from Phase 1, plus:

- `lib/demo-data.ts` — a mock-data service. Every value is randomized
  around realistic ranges on each page load. This is explicitly a stand-in
  for a future Supabase Realtime subscription, documented in the file's
  header comment.
- `app/dashboard/page.tsx` — the real dashboard: greeting header, Farm
  Health / Soil Moisture / Battery stat cards, robot status (connection,
  GPS, last-seen), a soil-moisture/battery line chart (recharts), an AI
  insights card, a farm map preview, and an alerts list.
- A `DemoBadge` component appears on the dashboard header and again on the
  AI insights card (as "DEMO AI ANALYSIS") — per the spec's Reality Rule,
  nothing here is allowed to look like live data.
- Verified by actually running `npm run build`: compiles, type-checks,
  and statically prerenders `/dashboard`. I also grepped the prerendered
  HTML output directly to confirm the chart and all card content actually
  render server-side, not just that the build didn't error.
- Bumped `recharts` from the version I first tried (2.15.0, flagged
  deprecated by npm) to the current 3.x major after checking.

## What's explicitly NOT built yet

Robot Control, Camera, GPS, Sensors, AI Insights (full page), Plant
Analysis, Irrigation, Alerts (full page), History, Analytics, Settings,
Supabase schema/auth/realtime, and reconciling this with your real
`agribot-dashboard` project.

## Known limitation of this build environment

Still no real rendered screenshot — Playwright's browser binary can't
download in this sandbox. Build + prerendered-HTML content checks pass,
but I have not visually looked at the page. Run `npm run dev` and check
it yourself before treating this as final.

## Run it

```bash
npm install
npm run dev   # http://localhost:3000
```

