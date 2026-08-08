# AgriBot AI — Phase 1

Design system, navigation shell, and landing page. This is a scoped first
slice of the full spec, not the complete platform.

## What's actually built and verified

- Next.js 16 / React 19 / TypeScript / Tailwind, `npm run build` passes
  (type-checked, both routes statically generated).
- Design tokens in `tailwind.config.ts` matching the spec's exact hex values.
  Light theme only — no `dark:` variants, no `darkMode` config, nothing to
  toggle.
- `components/Logo.tsx` — leaf + segmented robotic ring mark, used at nav
  size and (animated) at loading-screen size.
- `components/Sidebar.tsx` + `components/MobileBottomNav.tsx` +
  `components/AppShell.tsx` — the app-side navigation shell, grouped per the
  spec (Overview / Robot / Intelligence / Monitoring / System).
- `app/page.tsx` — landing page: hero, problem section, solution section,
  footer, using the spec's exact headline/copy.
- `app/dashboard/page.tsx` — a placeholder route, not the real dashboard.
  It exists only to prove the Sidebar/MobileBottomNav actually render and
  route correctly.
- `app/loading.tsx` — bright loading screen with the animated logo.

## What's explicitly NOT built yet

Dashboard cards/charts, Robot Control, Camera, GPS, Sensors, AI Insights,
Plant Analysis, Irrigation, Alerts, History, Analytics, Settings, Supabase
schema/auth, and the realtime/demo-mode data service. All of that is later
phases per the scope we agreed on.

## Known limitation of this build environment

I could not get a real rendered screenshot — Playwright's browser binary
couldn't download in this sandbox (its host isn't network-allowlisted here).
The build compiles and type-checks cleanly, but the visual layout hasn't
been screenshot-verified by me. Worth a quick look yourself with `npm run
dev` before treating it as final.

## Run it

```bash
npm install
npm run dev   # http://localhost:3000
```
