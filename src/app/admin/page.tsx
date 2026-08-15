"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, SectionHeading, IconTile } from "@/components/ui-kit";
import {
  Power,
  Film,
  ListChecks,
  Database,
  Users,
  MessageSquare,
  ChevronRight,
} from "lucide-react";

const SECTIONS = [
  {
    href: "/admin/robot",
    icon: Power,
    title: "Robot Control",
    desc: "Status, sensor data & recent commands",
  },
  {
    href: "/admin/messages",
    icon: MessageSquare,
    title: "Device Messages",
    desc: "View & delete all robot/website messages",
  },
  {
    href: "/admin/videos",
    icon: Film,
    title: "Home Page Videos",
    desc: "Upload & manage dashboard videos",
  },
  {
    href: "/admin/users",
    icon: Users,
    title: "Users",
    desc: "Manage roles & access",
  },
];

export default function AdminPage() {
  const supabase = createClient();
  const [readingCount, setReadingCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ count: readings }, { count: pending }] = await Promise.all([
        supabase.from("sensor_data").select("*", { count: "exact", head: true }),
        supabase
          .from("robot_commands")
          .select("*", { count: "exact", head: true })
          .eq("executed", false),
      ]);
      if (cancelled) return;
      setReadingCount(readings ?? 0);
      setPendingCount(pending ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <DashboardShell title="Admin Panel" subtitle="Manage robot, data & users" isAdmin>
      <>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3.5">
            <div className="flex items-center gap-1.5 text-muted dark:text-gray-400">
              <Database className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Sensor Readings</span>
            </div>
            <div className="mt-1.5 text-xl font-bold text-foreground dark:text-gray-100">
              {readingCount != null ? readingCount.toLocaleString() : "—"}
            </div>
          </Card>
          <Card className="p-3.5">
            <div className="flex items-center gap-1.5 text-muted dark:text-gray-400">
              <ListChecks className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Pending Commands</span>
            </div>
            <div className="mt-1.5 text-xl font-bold text-foreground dark:text-gray-100">
              {pendingCount != null ? pendingCount.toLocaleString() : "—"}
            </div>
          </Card>
        </div>

        <div className="mt-6">
          <SectionHeading eyebrow="Manage" title="System sections" />
          <div className="flex flex-col gap-2.5">
            {SECTIONS.map(({ href, icon: Icon, title, desc }) => (
              <Link key={href} href={href}>
                <Card className="flex items-center gap-3 p-3.5 transition active:scale-[0.99]">
                  <IconTile icon={Icon} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground dark:text-gray-100">
                      {title}
                    </span>
                    <span className="block text-xs text-muted dark:text-gray-400">{desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </>
    </DashboardShell>
  );
     }
      
