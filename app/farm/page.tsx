import Link from "next/link";
import { ArrowLeft, BatteryCharging, Droplets, MapPin, Sprout, Thermometer, Wifi } from "lucide-react";
import RobotImagesCard from "@/components/dashboard/RobotImagesCard";

const zones = [
  { name: "North Field", crop: "Tomato", health: 92, moisture: 68 },
  { name: "East Field", crop: "Chilli", health: 87, moisture: 61 },
  { name: "South Field", crop: "Groundnut", health: 79, moisture: 54 },
];

export default function FarmPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Farm Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">Live view of your farm, crops and AGRIBOT.</p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Farm Online
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Farm Area", "2.4 acres", Sprout],
            ["Soil Moisture", "61%", Droplets],
            ["Temperature", "29°C", Thermometer],
            ["Robot Battery", "84%", BatteryCharging],
          ].map(([label, value, Icon]) => {
            const I = Icon as typeof Sprout;
            return <div key={label as string} className="rounded-2xl border bg-card p-5 shadow-sm"><I className="mb-3 h-5 w-5" /><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Farm Map</h2><p className="text-sm text-muted-foreground">AGRIBOT location and field zones</p></div><MapPin className="h-5 w-5" /></div>
            <div className="relative flex min-h-[330px] items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
              <div className="absolute inset-8 rounded-[28%] border-2 border-dashed" />
              <div className="grid w-4/5 grid-cols-3 gap-2 opacity-70"><div className="h-36 rounded-xl border bg-emerald-500/10" /><div className="h-36 rounded-xl border bg-emerald-500/20" /><div className="h-36 rounded-xl border bg-emerald-500/10" /></div>
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium shadow"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> AGRIBOT-01</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" /> Connected</span><span>11.0168° N, 76.9558° E</span></div>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm"><h2 className="text-lg font-semibold">Field Health</h2><p className="mb-5 text-sm text-muted-foreground">Crop performance by zone</p><div className="space-y-5">{zones.map((z) => <div key={z.name}><div className="flex justify-between text-sm"><span className="font-medium">{z.name}</span><span>{z.health}%</span></div><p className="text-xs text-muted-foreground">{z.crop} · {z.moisture}% moisture</p><div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-foreground" style={{ width: `${z.health}%` }} /></div></div>)}</div></div>
        </section>

        <RobotImagesCard />
      </div>
    </main>
  );
}
