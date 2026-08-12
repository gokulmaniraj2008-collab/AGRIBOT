import Link from "next/link";
import {
  Leaf,
  Bot,
  Battery,
  Satellite,
  Camera,
  Radio,
  ArrowRight,
  Bug,
  ChevronRight,
  MapPin,
  User,
} from "lucide-react";

// Illustrative highlights for the pre-login marketing page. Real, live values
// are shown once a user signs in — see /dashboard, which reads from Supabase.
const FARM_OVERVIEW = [
  { label: "Plants", value: "128", color: "#16a34a" },
  { label: "Soil Moisture", value: "67%", color: "#0ea5e9" },
  { label: "Temperature", value: "28.4°C", color: "#f97316" },
  { label: "Active Alerts", value: "2", color: "#ef4444" },
];

const NAV_ITEMS = [
  { label: "Home", href: "/welcome" },
  { label: "Farm", href: "/login" },
  { label: "Robot", href: "/login" },
  { label: "AI Insights", href: "/login" },
  { label: "Monitoring", href: "/login" },
  { label: "Irrigation", href: "/login" },
];

function tint(color: string) {
  return { backgroundImage: `linear-gradient(135deg, ${color}14 0%, ${color}05 100%)` };
}

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-surface pb-12">
      {/* Nav header */}
      <div className="flex items-center justify-between border-b border-border bg-white px-5 py-3">
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <Leaf className="h-4.5 w-4.5" />
          </span>
          <span className="text-base font-bold tracking-tight text-foreground">
            Agri<span className="text-primary">Bot</span> AI
          </span>
        </span>

        <nav className="hidden items-center gap-5 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-muted transition hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/login"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition hover:bg-surface"
          aria-label="Profile / Sign in"
        >
          <User className="h-4 w-4" />
        </Link>
      </div>

      {/* Hero */}
      <section className="px-5 pt-8">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground">
          Intelligent Farming.
          <br />
          Powered by <span className="text-primary">AI &amp; Robotics.</span>
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          Monitor, analyze and protect your crops with a connected agricultural robot.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition hover:bg-primaryDark active:scale-[0.98]"
          >
            Open Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface active:scale-[0.98]"
          >
            Explore AgriBot
          </Link>
        </div>

        {/* Robot hero visual — SVG so no image asset is required */}
        <div className="relative mt-8 flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-primary/10 to-transparent">
          <RobotGlyph className="h-28 w-28 text-primary" />
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-primaryDark shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            AGRI-BOT 01 · ONLINE
          </div>
        </div>
      </section>

      {/* System status */}
      <section className="mt-6 px-5">
        <div className="rounded-2xl p-4 shadow-sm" style={tint("#16a34a")}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success" />
            <p className="text-sm font-semibold text-foreground">System Status</p>
          </div>
          <p className="mt-0.5 text-xs text-muted">All systems operational</p>

          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <StatusPill icon={Bot} label="Robot" value="Online" color="#16a34a" />
            <StatusPill icon={Battery} label="Battery" value="82%" color="#0ea5e9" />
            <StatusPill icon={Satellite} label="GPS" value="Connected" color="#6366f1" />
            <StatusPill icon={Radio} label="Sensors" value="Online" color="#a855f7" />
          </div>
        </div>
      </section>

      {/* Farm overview */}
      <section className="mt-4 px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Farm Overview</h2>
          <Link href="/login" className="flex items-center text-xs font-semibold text-primary">
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {FARM_OVERVIEW.map((item) => (
            <div
              key={item.label}
              className="rounded-xl px-2 py-3 text-center shadow-sm"
              style={tint(item.color)}
            >
              <p className="text-base font-bold text-foreground">{item.value}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI insight */}
      <section className="mt-4 px-5">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-4 text-white shadow-md shadow-primary/20">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">AI Insight</p>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-snug">
            Pest activity detected in Zone A3
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
              <div className="h-full w-[94%] rounded-full bg-white" />
            </div>
            <span className="text-xs font-semibold">94%</span>
          </div>
          <Link
            href="/login"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25"
          >
            View Analysis
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Live farm map preview */}
      <section id="how-it-works" className="mt-4 px-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Live Farm Map</h2>
          <Link href="/login" className="flex items-center text-xs font-semibold text-primary">
            View full map
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="relative h-40 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10 shadow-sm">
          <FieldGrid className="absolute inset-0 h-full w-full opacity-70" />
          <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-white shadow-md">
            <MapPin className="h-3.5 w-3.5" />
          </span>
        </div>
      </section>

      {/* Feature strip */}
      <section className="mt-6 px-5">
        <div className="grid grid-cols-2 gap-3">
          <FeatureCard icon={Camera} title="AI Plant Analysis" desc="Point, capture, diagnose." color="#0891b2" />
          <FeatureCard icon={Bot} title="Robot Control" desc="Drive and patrol remotely." color="#16a34a" />
        </div>
      </section>
    </main>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value,
  color = "#16a34a",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[10px] font-medium leading-none text-muted">{label}</span>
      <span className="text-[10px] font-semibold leading-none text-foreground">{value}</span>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  color = "#16a34a",
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  color?: string;
}) {
  return (
    <Link
      href="/login"
      className="rounded-xl p-3.5 shadow-sm transition hover:shadow-md active:scale-[0.98]"
      style={tint(color)}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}1f`, color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-2 text-xs font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted">{desc}</p>
    </Link>
  );
}

/** Minimal geometric robot glyph — avoids depending on an external image asset */
function RobotGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <rect x="18" y="38" width="64" height="34" rx="8" fill="currentColor" fillOpacity="0.18" />
      <rect x="24" y="44" width="52" height="22" rx="5" fill="currentColor" fillOpacity="0.35" />
      <circle cx="32" cy="80" r="9" fill="currentColor" />
      <circle cx="68" cy="80" r="9" fill="currentColor" />
      <rect x="40" y="20" width="20" height="16" rx="4" fill="currentColor" fillOpacity="0.5" />
      <line x1="50" y1="20" x2="50" y2="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="8" r="3.5" fill="currentColor" />
    </svg>
  );
}

/** Stylized field-row grid used as a lightweight farm map background */
function FieldGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 140" preserveAspectRatio="none" className={className} aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={i}
          x1={i * 40}
          y1="0"
          x2={i * 40}
          y2="140"
          stroke="currentColor"
          strokeOpacity="0.15"
          className="text-primary"
        />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <line
          key={i}
          x1="0"
          y1={i * 35}
          x2="300"
          y2={i * 35}
          stroke="currentColor"
          strokeOpacity="0.1"
          className="text-primary"
        />
      ))}
    </svg>
  );
}
