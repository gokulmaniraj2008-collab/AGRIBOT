"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Activity, Database, ShieldCheck, Users, RefreshCw } from "lucide-react";

const ADMIN_EMAIL = "gokulmaniraj2008@gmail.com";

type SensorRow = {
  id: number;
  created_at: string;
  soil_moisture: number | null;
  temperature: number | null;
  humidity: number | null;
  distance_cm: number | null;
  motor: string | null;
  relay: boolean | null;
  status: string | null;
};

export default function AdminPage() {
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [rows, setRows] = useState<SensorRow[]>([]);
  const [logCount, setLogCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    const results = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("agribot_sensor_data").select("id,created_at,soil_moisture,temperature,humidity,distance_cm,motor,relay,status").order("created_at", { ascending: false }).limit(25),
      supabase.from("agribot_log").select("id", { count: "exact", head: true }),
    ]);
    const userData = results[0];
    const sensors = results[1];
    const logs = results[2];
    setEmail(userData.data.user?.email ?? null);
    setRows((sensors.data as SensorRow[] | null) ?? []);
    setLogCount(logs.count ?? 0);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const latest = rows[0];
  const isAdmin = email?.trim().toLowerCase() === ADMIN_EMAIL;

  if (loading) {
    return <DashboardShell title="Admin Panel" subtitle="AgriBot system administration"><div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted dark:border-gray-800 dark:bg-gray-900">Loading admin panel…</div></DashboardShell>;
  }

  if (!isAdmin) {
    return <DashboardShell title="Admin Panel" subtitle="Restricted area"><div className="rounded-2xl border border-danger/20 bg-danger/5 p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-danger" /><h2 className="mt-3 text-lg font-bold text-foreground">Admin access required</h2><p className="mt-1 text-sm text-muted">This account is not on the AgriBot admin allowlist.</p></div></DashboardShell>;
  }

  return (
    <DashboardShell title="Admin Panel" subtitle="AgriBot system administration">
      <div className="space-y-4">
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-bold">Administrator</span></div>
              <p className="mt-2 text-sm font-semibold text-foreground">{ADMIN_EMAIL}</p>
              <p className="mt-1 text-xs text-muted">Admin access is restricted to this verified account.</p>
            </div>
            <button onClick={() => void load()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900">
              <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={Activity} label="Sensor rows" value={String(rows.length)} />
          <Stat icon={Database} label="Log rows" value={String(logCount)} />
          <Stat icon={Users} label="Admin users" value="1" />
          <Stat icon={ShieldCheck} label="Access" value="Protected" />
        </section>

        <section className="rounded-2xl border border-border bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="text-base font-bold text-foreground">Robot status</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Motor" value={latest?.motor ?? "—"} />
            <Metric label="Pump" value={latest?.relay ? "ON" : "OFF"} />
            <Metric label="Soil" value={latest?.soil_moisture == null ? "—" : String(Math.round(latest.soil_moisture)) + "%"} />
            <Metric label="Temperature" value={latest?.temperature == null ? "—" : latest.temperature.toFixed(1) + "°C"} />
          </div>
          <p className="mt-4 rounded-xl bg-surface px-3 py-2 text-xs text-muted">{latest?.status ?? "No sensor status available"}</p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-border px-5 py-4 dark:border-gray-800"><h2 className="text-base font-bold text-foreground">Recent sensor activity</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-surface text-muted"><tr><th className="px-5 py-3 font-semibold">Time</th><th className="px-3 py-3 font-semibold">Soil</th><th className="px-3 py-3 font-semibold">Temp</th><th className="px-3 py-3 font-semibold">Humidity</th><th className="px-3 py-3 font-semibold">Distance</th><th className="px-3 py-3 font-semibold">Motor</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border dark:border-gray-800">
                    <td className="whitespace-nowrap px-5 py-3 text-muted">{new Date(row.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                    <td className="px-3 py-3 text-foreground">{row.soil_moisture == null ? "—" : String(Math.round(row.soil_moisture)) + "%"}</td>
                    <td className="px-3 py-3 text-foreground">{row.temperature == null ? "—" : row.temperature.toFixed(1) + "°C"}</td>
                    <td className="px-3 py-3 text-foreground">{row.humidity == null ? "—" : String(Math.round(row.humidity)) + "%"}</td>
                    <td className="px-3 py-3 text-foreground">{row.distance_cm == null ? "—" : String(Math.round(row.distance_cm)) + " cm"}</td>
                    <td className="px-3 py-3 font-semibold text-foreground">{row.motor ?? "—"}</td>
                    <td className="max-w-xs px-5 py-3 text-muted">{row.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="rounded-2xl border border-border bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><Icon className="h-4 w-4 text-primary" /><p className="mt-3 text-xs text-muted">{label}</p><p className="mt-1 text-lg font-extrabold text-foreground">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-surface p-3"><p className="text-[11px] font-medium text-muted">{label}</p><p className="mt-1 text-sm font-bold text-foreground">{value}</p></div>;
}
