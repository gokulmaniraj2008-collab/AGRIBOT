"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, IconTile } from "@/components/ui-kit";
import type { SensorReading } from "@/lib/types";
import { Database, Trash2, ArrowLeft } from "lucide-react";

export default function AdminSensorsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("sensor_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<SensorReading[]>()
      .then(({ data }) => {
        if (!cancelled && data) setReadings(data);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function clearAllReadings() {
    setBusy("readings");
    setError(null);
    const { error: err } = await supabase
      .from("sensor_data")
      .delete()
      .not("id", "is", null);
    if (err) setError(err.message);
    else setReadings([]);
    setBusy(null);
  }

  return (
    <DashboardShell title="Sensor Data" subtitle="Admin" isAdmin>
      <>
        <button
          onClick={() => router.push("/admin")}
          className="mb-4 flex items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Admin
        </button>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <IconTile icon={Database} size={32} />
              <span className="text-sm font-semibold text-foreground dark:text-gray-100">
                Sensor Data
              </span>
            </span>
            <button
              onClick={clearAllReadings}
              disabled={busy === "readings"}
              className="flex items-center gap-1 rounded-lg border border-danger/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50 dark:bg-gray-900"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {busy === "readings" ? "Clearing…" : "Clear all"}
            </button>
          </div>
          {readings.length === 0 ? (
            <p className="text-xs text-muted dark:text-gray-400">No readings yet.</p>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-muted dark:text-gray-400">
                    <th className="pb-2 font-semibold">Time</th>
                    <th className="pb-2 font-semibold">Soil</th>
                    <th className="pb-2 font-semibold">Temp</th>
                    <th className="pb-2 font-semibold">Humidity</th>
                    <th className="pb-2 font-semibold">Battery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-gray-800">
                  {readings.map((r) => (
                    <tr key={r.id} className="text-foreground dark:text-gray-100">
                      <td className="py-2 text-muted dark:text-gray-400">
                        {new Date(r.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 font-medium">
                        {r.soil_moisture != null
                          ? `${r.soil_moisture.toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="py-2 font-medium">
                        {r.temperature != null
                          ? `${r.temperature.toFixed(1)}°C`
                          : "—"}
                      </td>
                      <td className="py-2 font-medium">
                        {r.humidity != null
                          ? `${r.humidity.toFixed(0)}%`
                          : "—"}
                      </td>
                      <td className="py-2 font-medium">
                        {r.battery_percent != null
                          ? `${r.battery_percent.toFixed(0)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    </DashboardShell>
  );
}
