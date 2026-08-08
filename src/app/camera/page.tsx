import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Camera, Sparkles, ArrowRight, WifiOff } from "lucide-react";

export default function CameraPage() {
  return (
    <DashboardShell title="Live Camera" subtitle="agribot-01">
      <>
        {/* Camera viewport — styled like a live feed, but truthful about connection state */}
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-gray-900">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70">
              <WifiOff className="h-5 w-5" />
            </span>
            <p className="text-xs font-medium text-white/70">No camera feed connected</p>
          </div>
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            OFFLINE
          </span>
        </div>

        {/* Disabled controls — same layout as the live version will use, so nothing has to be
            rebuilt once the ESP32-CAM stream is wired in; they just stay honestly inert until then. */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <DisabledAction icon={Camera} label="Capture Image" />
          <DisabledAction icon={Camera} label="Record" />
          <DisabledAction icon={Sparkles} label="AI Analyze" />
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-4 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-foreground dark:text-gray-100">
            Camera hardware not streaming yet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted dark:text-gray-400">
            This view will go live once the ESP32-CAM is wired in and streaming to Supabase
            Storage. Capture, Record and live AI Analyze depend on that feed.
          </p>
        </div>

        <div className="mt-4 rounded-2xl bg-gradient-to-br from-primary to-secondary p-4 text-white shadow-md shadow-primary/20">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
            <Sparkles className="h-3.5 w-3.5" />
            Works today
          </p>
          <p className="mt-1 text-sm font-medium leading-snug">
            Upload or take a photo of a plant for a real AI health check — no live camera required.
          </p>
          <Link
            href="/recommendations"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25"
          >
            Go to AI Plant Analysis
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </>
    </DashboardShell>
  );
}

function DisabledAction({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <button
      disabled
      className="flex flex-col items-center gap-1 rounded-xl border border-border bg-white py-3 text-[10px] font-medium text-muted opacity-60 dark:border-gray-800 dark:bg-gray-900"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
