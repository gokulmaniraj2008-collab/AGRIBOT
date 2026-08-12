# AgriBot AI — Dashboard (v15)

Next.js 15 + Supabase web dashboard for the AgriBot smart farming robot.
Deployed on Vercel, works fully in mobile browsers.

## What's in this v15

- Animated logo splash screen (`/`) → welcome screen (`/welcome`) → login
- Email/password auth **and** "Continue with Google" (Supabase Auth),
  no public sign-up
- Light, white-background UI throughout with a 5-tab bottom nav:
  **Dashboard, Field, Robot, Alerts, Profile**
- **Dashboard** — live sensor summary, soil moisture trend, quick links
- **Field** — last known GPS position; zone health map is a labeled
  placeholder until GPS is wired into the firmware
- **Robot** — status card, Auto/Manual toggle, manual drive controls,
  pump on/off
- **Alerts** — threshold-based alerts computed live from the latest
  sensor reading (low battery, low soil moisture, high temp, obstacle,
  offline) — not hardcoded
- **Recommendations** — rule-based tips from live sensor data (a
  lighter-weight stand-in for the future Gemini-powered AI advice)
- **Ask AI** (`/assistant`) — a Gemini-powered assistant for text
  questions, crop/leaf photo diagnosis, and voice input (mic →
  transcript → answer, with spoken playback). Calls Gemini through
  a server route (`/api/ai`) so the API key stays on the server —
  see the setup note below.
- **Analytics** — soil moisture / temperature / humidity trend charts
- **Camera** — placeholder empty state until the ESP32-CAM is wired in
- **Profile** — signed-in account, connected robot, sign out

Screens that need hardware or AI pipelines that don't exist yet (full
interactive field map, live camera, image-based pest detection) show
a clearly labeled "coming soon" state instead of fake data — once the
ESP32/Gemini side is proven working, swap those in for the real thing.

### Enabling Google sign-in

1. In the [Google Cloud Console](https://console.cloud.google.com/),
   create an OAuth Client ID (Web application) and add
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` as an
   authorized redirect URI.
2. In Supabase → Authentication → Providers → Google, enable it and
   paste in the Client ID and Client Secret.
3. In Supabase → Authentication → URL Configuration, add your app's
   URL (e.g. `http://localhost:3000` and your Vercel domain) to
   Redirect URLs — the app calls back to `/auth/callback`.

No extra environment variables are needed for this — Google auth is
configured entirely in the Supabase dashboard.

### Enabling "Ask AI"

1. Get a free Gemini API key at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Add it as `GEMINI_API_KEY` in `.env.local` (and in Vercel →
   Project → Settings → Environment Variables) — **not** prefixed
   with `NEXT_PUBLIC_`, since it's only ever used server-side by
   `/api/ai`.
3. That's it — the "Ask AI" tab on the dashboard will start working.

## Deliberately NOT in this v1

GPS map, camera image viewer, and Gemini AI disease-detection results
are left out until the physical robot's hardware (motor count, pump
voltage/converter, ESP32 core version) is confirmed and the firmware
is actually sending that data. Adding UI for data that doesn't exist
yet just creates dead screens — these get added once the ESP32 side
is proven working.

## Setup

### 1. Supabase project

1. Create a project at supabase.com
2. In the SQL Editor, run `supabase/migrations/0001_init.sql`
3. In Authentication → Users, manually create your login (no public
   sign-up form exists in this app on purpose)
4. Copy your Project URL and anon key from Settings → API

### 2. Local development

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run dev
```

Visit http://localhost:3000 — you'll be redirected to /login.

### 3. Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo in Vercel
3. Add the same environment variables from `.env.local.example` in
   Vercel → Project → Settings → Environment Variables
4. Deploy

## How the ESP32 talks to this

The ESP32 does **not** use the anon key or go through this Next.js app
to write data. It writes directly to Supabase using the `service_role`
key (kept only in the firmware, never in this repo or the browser):

- **Telemetry** (every few seconds): ESP32 inserts a row into
  `sensor_data`, and upserts `robot_status` (online, pump_status,
  motor_state, mode).
- **Commands** (polling, every 1–2s): ESP32 reads unexecuted rows from
  `robot_commands` where `robot_id = 'agribot-01'`, acts on them, then
  marks them `executed = true`.

This dashboard only ever uses the public `anon` key plus Supabase Auth
+ RLS — it can read status/sensor data and insert commands, nothing
more.

## Database schema

See `supabase/migrations/0001_init.sql` for the full schema:
`sensor_data`, `robot_status`, `robot_commands`, with RLS policies
restricting dashboard access to authenticated users.

## Next steps (once hardware is confirmed)

1. ESP32 firmware: WiFi connect, sensor reads, motor/pump control
   matching actual wiring, Supabase writes via service_role key,
   command polling
2. GPS fields already exist in `sensor_data` — add a map view once
   GPS is wired in
3. ESP32-CAM → Supabase Storage → Edge Function → Gemini API →
   results written back to a new `plant_analysis` table
4. Add a settings page for thresholds (auto-irrigation trigger level,
   etc.) once auto mode logic is implemented in firmware
