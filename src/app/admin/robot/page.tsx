"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge, IconTile } from "@/components/ui-kit";
import type { RobotStatus } from "@/lib/types";
import { Power, RefreshCw, ArrowLeft } from "lucide-react";

export default function AdminRobotPage() {
  const supabase = createClient();
  const router = useRouter();
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("robot_status")
      .select("*")
      .eq("robot_id", "agribot-01")
      .single<RobotStatus>()
      .then(({ data }) => {
        if (!cancelled && data) setStatus(data);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function refresh() {
    setBusy("refresh");
    const { data } = await supabase
      .from("robot_status")
      .select("*")
      .eq("robot_id", "agribot-01")
      .single<RobotStatus>();
    if (data) setStatus(data);
    setBusy(null);
  }

  async function resetRobot() {
    setBusy("reset");
    setError(null);
    const { data, error: err } = await supabase
      .from("robot_status")
      .update({
        online: false,
        mode: "manual",
        pump_status: false,
        motor_state: "stopped",
        speed_value: 0,
      })
      .eq("robot_id", "agribot-01")
      .select()
      .single<RobotStatus>();
    if (err) setError(err.message);
    else if (data) setStatus(data);
    setBusy(null);
  }

  async function clearPendingCommands() {
    setBusy("pending");
    setError(null);
    const { error: err } = await supabase
      .from("robot_commands")
      .delete()
      .eq("executed", false);
    if (err) setError(err.message);
    setBusy(null);
  }

  const isOnline = status?.online ?? false;
  const isStale =
    status?.updated_at && Date.now() - new Date(status.updated_at).getTime() > 30_000;
  const active = isOnline && !isStale;

  return (
    <DashboardShell title="Robot Control" subtitle="Admin" isAdmin>
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
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <IconTile icon={Power} size={32} />
              <span className="text-sm font-semibold text-foreground dark:text-gray-100">
                agribot-01
              </span>
            </span>
            <div className="flex items-center gap-2">
              <StatusBadge
                label={active ? "ONLINE" : "OFFLINE"}
                tone={active ? "success" : "muted"}
              />
              <button
                onClick={refresh}
                disabled={busy === "refresh"}
                className="text-muted transition hover:text-foreground"
                aria-label="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
              <p className="text-[11px] font-medium text-muted dark:text-gray-400">Mode</p>
              <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                {status?.mode ?? "—"}
              </p>
            </div>
            <div className="rounded-xl bg-background p-3 dark:bg-gray-800/50">
              <p className="text-[11px] font-medium text-muted dark:text-gray-400">Motor</p>
              <p className="mt-0.5 text-sm font-bold text-foreground dark:text-gray-100">
                {status?.motor_state ?? "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={resetRobot}
              disabled={busy === "reset"}
              className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-xs font-semibold text-foreground transition hover:bg-background disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {busy === "reset" ? "Resetting…" : "Force stop & reset"}
            </button>
            <button
              onClick={clearPendingCommands}
              disabled={busy === "pending"}
              className="rounded-xl border border-border bg-white px-3.5 py-2.5 text-xs font-semibold text-foreground transition hover:bg-background disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {busy === "pending" ? "Clearing…" : "Clear pending commands"}
            </button>
          </div>
        </Card>
      </>
    </DashboardShell>
  );
}
