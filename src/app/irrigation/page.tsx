import { createClient } from "@/lib/supabase/server";
import IrrigationClient from "./irrigation-client";
import type { RobotStatus, SensorReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function IrrigationPage() {
  const supabase = await createClient();

  const [{ data: status }, { data: latest }] = await Promise.all([
    supabase.from("robot_status").select("*").eq("robot_id", "agribot-01").single<RobotStatus>(),
    supabase
      .from("sensor_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<SensorReading>(),
  ]);

  return <IrrigationClient initialStatus={status ?? null} initialLatest={latest ?? null} />;
}
