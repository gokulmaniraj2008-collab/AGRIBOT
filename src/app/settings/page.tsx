"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/lib/theme-context";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, SectionHeading, StatusBadge, IconTile } from "@/components/ui-kit";
import type { RobotStatus } from "@/lib/types";
import {
  User,
  ChevronRight,
  Sun,
  Moon,
  Droplet,
  ShieldCheck,
  Info,
  LogOut,
} from "lucide-react";

/** Simple on/off switch, styled to match the rest of the design system */
function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState<RobotStatus | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [thresholdInput, setThresholdInput] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, avatar_url")
          .eq("id", data.user.id)
          .single<{ role: string; avatar_url: string | null }>();
        setIsAdmin(profile?.role === "admin");
        setAvatarUrl(profile?.avatar_url ?? null);
      }
    });

    supabase
      .from("robot_status")
      .select("*")
      .eq("robot_id", "agribot-01")
      .single<RobotStatus>()
      .then(({ data }) => {
        if (data) {
          setStatus(data);
          setThresholdInput(String(data.irrigation_threshold));
        }
      });
  }, [supabase]);

  const sendCommand = useCallback(async (command: string, value?: number) => {
    setSending(command);
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, value }),
      });
      if (res.ok) {
        setStatus((prev) => {
          if (!prev) return prev;
          if (command === "set_irrigation_auto_on") return { ...prev, irrigation_auto: true };
          if (command === "set_irrigation_auto_off") return { ...prev, irrigation_auto: false };
          if (command === "set_irrigation_threshold" && value != null)
            return { ...prev, irrigation_threshold: value };
          return prev;
        });
      }
    } finally {
      setSending(null);
    }
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DashboardShell title="Settings" isAdmin={isAdmin}>
      <>
        {/* Profile summary */}
        <Link href="/profile">
          <Card className="flex items-center gap-3.5 p-4 transition active:scale-[0.99]">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <User className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground dark:text-gray-100">
                {email ?? "Loading..."}
              </p>
              <p className="mt-0.5 text-xs text-muted dark:text-gray-400">View profile</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Card>
        </Link>

        {/* Robot automation — real fields on robot_status, written via /api/commands */}
        <div className="mt-6">
          <SectionHeading eyebrow="Robot" title="Automation" desc="agribot-01" />
          <div className="space-y-2.5">
            <Card className="p-3.5">
              <div className="flex items-center gap-3">
                <IconTile icon={Droplet} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                    Auto Irrigation
                  </p>
                  <p className="text-xs text-muted dark:text-gray-400">
                    Runs the pump when soil moisture drops below the threshold
                  </p>
                </div>
                <Switch
                  checked={!!status?.irrigation_auto}
                  disabled={sending != null}
                  onChange={() =>
                    sendCommand(
                      status?.irrigation_auto
                        ? "set_irrigation_auto_off"
                        : "set_irrigation_auto_on"
                    )
                  }
                />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 dark:border-gray-800">
                <label className="text-xs font-medium text-muted dark:text-gray-400">
                  Threshold
                </label>
                <input
                  type="number"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  onBlur={() => {
                    const v = Number(thresholdInput);
                    if (!Number.isNaN(v) && v !== status?.irrigation_threshold) {
                      sendCommand("set_irrigation_threshold", v);
                    }
                  }}
                  className="w-16 rounded-lg border border-border bg-white px-2 py-1 text-xs font-semibold text-foreground outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
                />
                <span className="text-xs text-muted dark:text-gray-400">% soil moisture</span>
              </div>
            </Card>
          </div>
        </div>

        {/* Appearance */}
        <div className="mt-6">
          <SectionHeading eyebrow="Display" title="Appearance" />
          <Card className="flex items-center gap-3 p-3.5">
            <IconTile icon={theme === "dark" ? Moon : Sun} size={32} color="#f59e0b" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                Dark Mode
              </p>
              <p className="text-xs text-muted dark:text-gray-400">
                {theme === "dark" ? "Currently on" : "Currently off"}
              </p>
            </div>
            <Switch checked={theme === "dark"} onChange={toggleTheme} />
          </Card>
        </div>

        {/* System info + admin */}
        <div className="mt-6">
          <SectionHeading eyebrow="System" title="About" />
          <div className="space-y-2.5">
            <Card className="flex items-center gap-3 p-3.5">
              <IconTile icon={Info} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground dark:text-gray-100">
                  AgriBot AI Dashboard
                </p>
                <p className="text-xs text-muted dark:text-gray-400">v1 · agribot-01</p>
              </div>
              <StatusBadge
                label={status?.online ? "ONLINE" : "OFFLINE"}
                tone={status?.online ? "success" : "muted"}
              />
            </Card>

            {isAdmin && (
              <Link href="/admin">
                <Card className="flex items-center gap-3 p-3.5 transition active:scale-[0.99]">
                  <IconTile icon={ShieldCheck} size={32} />
                  <span className="flex-1 text-sm font-semibold text-foreground dark:text-gray-100">
                    Admin Panel
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Card>
              </Link>
            )}
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger transition hover:bg-danger/10 active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </>
    </DashboardShell>
  );
}
