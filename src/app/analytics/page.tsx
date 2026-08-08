import { createClient } from "@/lib/supabase/server";
import MonitoringClient from "./analytics-client";
import type { SensorReading } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const { data: readings } = await supabase
    .from("sensor_data")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<SensorReading[]>();

  return <MonitoringClient readings={readings ?? []} />;
}
