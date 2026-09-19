"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { HomeVideo, SensorReading } from "@/lib/types";
import { formatAgriBotTimeOnly } from "@/lib/time";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatCard, AIBanner, SectionHeading } from "@/components/ui-kit";
import VideoQuickBox from "@/components/video-quick-box";
import {
  Droplets, Thermometer, Wind, Battery, Map, Bell, Sparkles,
  ChevronRight, LineChart as LineChartIcon, Camera, Wifi,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

export default function DashboardClient({
  initialReadings = [],
  initialHomeVideos = [],
  isAdmin = false,
}: {
  initialReadings?: SensorReading[];
  initialHomeVideos?: HomeVideo[];
  isAdmin?: boolean;
}) {
  const supabase = useRef(createClient()).current;

  const [readings, setReadings] = useState<SensorReading[]>([]);
  const liveSessionStartedAt = useRef<string | null>(null);
  const [homeVideos, setHomeVideos] = useState<HomeVideo[]>(initialHomeVideos);

  useEffect(() => {
    const startedAt = new Date().toISOString();
    liveSessionStartedAt.current = startedAt;
    setReadings([]);

    supabase
      .from("agribot_sensor_data")
      .select("*")
      .gte("created_at", startedAt)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<SensorReading[]>()
      .then(({ data }) => {
        if (data && liveSessionStartedAt.current === startedAt) setReadings(data);
      });

    supabase
      .from("home_videos")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .returns<HomeVideo[]>()
      .then(({ data }) => {
        if (data) setHomeVideos(data);
      });

    // Realtime is not enabled on agribot_sensor_data, so polling is the
    // reliable fallback for the ESP32's current readings.
    const poll = async () => {
      const sessionStartedAt = liveSessionStartedAt.current;
      if (!sessionStartedAt) return;

      const { data } = await supabase
        .from("agribot_sensor_data")
        .select("*")
        .gte("created_at", sessionStartedAt)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<SensorReading[]>();

      if (liveSessionStartedAt.current === sessionStartedAt && data) {
        setReadings(data);
      }
    };

    const interval = window.setInterval(poll, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("agribot_sensor_data_inserts_dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agribot_sensor_data" },
        (payload) => {
          const reading = payload.new as SensorReading;
          if (!liveSessionStartedAt.current || reading.created_at < liveSessionStartedAt.current) return;
          setReadings((prev) => [reading, ...prev].slice(0, 50));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const latest = readings[0];
  const chronological = [...readings].reverse();

  const seriesFor = (key: keyof SensorReading) =>
    chronological.map((r) => ({ v: r[key] as number | null }));

  const chartData = chronological.map((r) => ({
    time: formatAgriBotTimeOnly(r.created_at).slice(0, 5),
    soil: r.soil_moisture,
  }));

  const lastUpdated = latest?.created_at ? formatAgriBotTimeOnly(latest.created_at) : null;

  const aiTip =
    latest?.soil_moisture != null && latest.soil_moisture < 30
      ? "Soil moisture is trending low. Consider running irrigation soon."
      : latest?.battery_percent != null && latest.battery_percent < 20
      ? "Robot battery is low — schedule a charging cycle before the next run."
      : "Field conditions look stable. No action needed right now.";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <DashboardShell title="AgriBot AI" subtitle="Field ID: —" isAdmin={isAdmin}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-foreground dark:text-gray-100">
            {greeting} 👋
          </h2>
        </div>
        {lastUpdated && (
          <p className="mt-1 shrink-0 text-[11px] text-muted dark:text-gray-400">
            Updated {lastUpdated}
          </p>
        )}
      </div>

      <div className="mb-4">
        <AIBanner text={aiTip} cta="Ask AI" />
      </div>

      <VideoQuickBox videos={homeVideos} />

      <div className="mt-4">
        <SectionHeading eyebrow="Live Readings" title="Field Overview" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={Droplets}
            label="Soil Moisture"
            value={latest?.soil_moisture != null ? latest.soil_moisture.toFixed(0) : "—"}
            unit="%"
            color="#0ea5e9"
            percent={latest?.soil_moisture ?? undefined}
          />
          <StatCard
            icon={Wind}
            label="Humidity"
            value={latest?.humidity != null ? latest.humidity.toFixed(0) : "—"}
            unit="%"
            color="#6366f1"
            percent={latest?.humidity ?? undefined}
          />
          <StatCard
            icon={Thermometer}
            label="Temperature"
            value={latest?.temperature != null ? latest.temperature.toFixed(1) : "—"}
            unit="°C"
            color="#f97316"
            data={seriesFor("temperature")}
          />
          <StatCard
            icon={Battery}
            label="Battery"
            value={latest?.battery_percent != null ? latest.battery_percent.toFixed(0) : "—"}
            unit="%"
            color="#16a34a"
            percent={latest?.battery_percent ?? undefined}
          />
        </div>
      </div>

      <Card className="mt-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground dark:text-gray-100">
            Soil Moisture — Recent
          </span>
          <LineChartIcon className="h-4 w-4 text-muted dark:text-gray-400" />
        </div>
        <div className="h-40 w-full">
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ebe8" />
                <XAxis dataKey="time" stroke="#6b7583" fontSize={10} tickLine={false} />
                <YAxis stroke="#6b7583" fontSize={10} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e6ebe8",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="soil" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted dark:text-gray-400">
              Not enough data yet — waiting on the robot.
            </div>
          )}
        </div>
      </Card>

      <div className="mt-4">
        <SectionHeading title="Quick Actions" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <QuickLink href="/assistant" icon={Sparkles} label="Ask AI" />
          <QuickLink href="/devices" icon={Wifi} label="Devices" />
          <QuickLink href="/camera" icon={Camera} label="Camera" />
          <QuickLink href="/field" icon={Map} label="Field Map" />
          <QuickLink href="/alerts" icon={Bell} label="Alerts" />
        </div>
      </div>
    </DashboardShell>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-border bg-white p-3 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground dark:text-gray-100">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-muted dark:text-gray-500" />
    </Link>
  );
      }
      
