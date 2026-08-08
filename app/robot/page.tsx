import { AppShell } from "@/components/AppShell";
import { DemoBadge } from "@/components/dashboard/DemoBadge";
import { getDemoTelemetry } from "@/lib/demo-data";
import { BatteryMedium, CircleDot, Compass, Droplets, MapPin, Radio, ShieldCheck, Wifi } from "lucide-react";

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof BatteryMedium }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm text-text-secondary"><Icon className="h-4 w-4" />{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

export default function RobotPage() {
  const robot = getDemoTelemetry();
  const online = robot.connection === "online";

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-5 py-6 lg:px-8 lg:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><Radio className="h-5 w-5" /></div>
              <div><h1 className="text-2xl font-semibold">Robot Control</h1><p className="mt-1 text-sm text-text-secondary">{robot.robotId} · Autonomous agricultural rover</p></div>
            </div>
          </div>
          <DemoBadge />
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${online ? "bg-green-500" : "bg-red-500"}`} />
              <div><p className="font-medium">{online ? "Robot online" : "Robot offline"}</p><p className="text-sm text-text-secondary">Last update {robot.lastSeenSeconds}s ago</p></div>
            </div>
            <div className="rounded-full border border-border px-3 py-1.5 text-sm font-medium">AUTO MODE</div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Battery" value={`${robot.batteryPct}%`} icon={BatteryMedium} />
            <Metric label="Soil moisture" value={`${robot.soilMoisturePct}%`} icon={Droplets} />
            <Metric label="GPS" value={`${robot.latitude.toFixed(4)}, ${robot.longitude.toFixed(4)}`} icon={MapPin} />
            <Metric label="Signal" value={online ? "Connected" : "Disconnected"} icon={Wifi} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold">Robot navigation</h2><p className="mt-1 text-sm text-text-secondary">Current position and patrol state</p></div><Compass className="h-5 w-5 text-text-secondary" /></div>
            <div className="mt-5 flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border bg-bg">
              <div className="text-center"><MapPin className="mx-auto h-8 w-8" /><p className="mt-2 font-medium">Farm navigation map</p><p className="mt-1 text-sm text-text-secondary">GPS: {robot.latitude.toFixed(6)}, {robot.longitude.toFixed(6)}</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="font-semibold">Robot systems</h2>
            <div className="mt-4 space-y-3">
              {["ESP32 controller", "ESP32-CAM", "GPS module", "Ultrasonic obstacle sensor", "Soil moisture sensor", "Water pump relay"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-xl border border-border px-3 py-3 text-sm"><span>{item}</span><span className="flex items-center gap-1.5 text-text-secondary"><CircleDot className="h-3.5 w-3.5" /> Ready</span></div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-surface p-5"><ShieldCheck className="h-5 w-5" /><h2 className="mt-3 font-semibold">Safety</h2><p className="mt-1 text-sm text-text-secondary">Obstacle detection and emergency-stop state are monitored by the robot controller.</p></section>
          <section className="rounded-2xl border border-border bg-surface p-5"><Droplets className="h-5 w-5" /><h2 className="mt-3 font-semibold">Irrigation</h2><p className="mt-1 text-sm text-text-secondary">Mode: {robot.irrigationMode}. Pump control will use live telemetry when the hardware backend is connected.</p></section>
          <section className="rounded-2xl border border-border bg-surface p-5"><Compass className="h-5 w-5" /><h2 className="mt-3 font-semibold">Patrol</h2><p className="mt-1 text-sm text-text-secondary">Autonomous row navigation is ready for live GPS and motor-controller integration.</p></section>
        </div>
      </div>
    </AppShell>
  );
}
