"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, IconTile, StatusBadge } from "@/components/ui-kit";
import type { RobotCommandRow } from "@/lib/types";
import { ListChecks, ArrowLeft } from "lucide-react";

export default function AdminCommandsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [commands, setCommands] = useState<RobotCommandRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("robot_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<RobotCommandRow[]>()
      .then(({ data }) => {
        if (!cancelled && data) setCommands(data);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <DashboardShell title="Recent Commands" subtitle="Admin" isAdmin>
      <>
        <button
          onClick={() => router.push("/admin")}
          className="mb-4 flex items-center gap-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Admin
        </button>

        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <IconTile icon={ListChecks} size={32} />
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">
              Recent Commands
            </span>
          </div>
          {commands.length === 0 ? (
            <p className="text-xs text-muted dark:text-gray-400">No commands yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
              {commands.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-3 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground dark:text-gray-100">
                      {c.command}
                    </span>
                    {c.value != null && (
                      <span className="text-muted dark:text-gray-400"> · value {c.value}</span>
                    )}
                    <div className="mt-0.5 text-muted dark:text-gray-400">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <StatusBadge
                    label={c.executed ? "Executed" : "Pending"}
                    tone={c.executed ? "success" : "warning"}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
    </DashboardShell>
  );
}
