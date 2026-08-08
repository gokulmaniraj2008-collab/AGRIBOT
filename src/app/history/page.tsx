import { createClient } from "@/lib/supabase/server";
import HistoryClient from "./history-client";
import type { SensorReading, RobotCommandRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = await createClient();

  const [{ data: readings }, { data: commands }] = await Promise.all([
    supabase
      .from("sensor_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<SensorReading[]>(),
    supabase
      .from("robot_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<RobotCommandRow[]>(),
  ]);

  return (
    <HistoryClient
      initialReadings={readings ?? []}
      initialCommands={commands ?? []}
    />
  );
}
