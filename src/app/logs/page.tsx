import { createClient } from "@/lib/supabase/server";
import LogsClient from "./logs-client";
import type { RobotLog } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("robot_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<RobotLog[]>();

  return <LogsClient initialLogs={logs ?? []} />;
}
