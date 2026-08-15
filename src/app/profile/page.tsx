"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadImageToCloudinary } from "@/lib/cloudinary-image";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge, SectionHeading } from "@/components/ui-kit";
import type { RobotStatus } from "@/lib/types";
import {
  User,
  LogOut,
  Bot,
  Info,
  ShieldCheck,
  ChevronRight,
  Camera,
  Cpu,
} from "lucide-react";

const MORE_LINKS = [
  { href: "/device", label: "ESP32 Device", desc: "Hardware status & config", icon: Cpu },
  { href: "/camera", label: "Camera Feed", desc: "Live ESP32-CAM view", icon: Camera },
];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [robotStatus, setRobotStatus] = useState<RobotStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
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
  }, [supabase]);

  useEffect(() => {
    supabase
      .from("robot_status")
      .select("*")
      .eq("robot_id", "agribot-01")
      .single<RobotStatus>()
      .then(({ data }) => {
        if (data) setRobotStatus(data);
      });

    const channel = supabase
      .channel("robot_status_changes_profile")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "robot_status", filter: "robot_id=eq.agribot-01" },
        (payload) => setRobotStatus(payload.new as RobotStatus)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const isOnline = robotStatus?.online ?? false;
  const isStale =
    robotStatus?.updated_at &&
    Date.now() - new Date(robotStatus.updated_at).getTime() > 30_000;
  const robotActive = isOnline && !isStale;

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setError(null);
    setUploading(true);

    try {
      const url = await uploadImageToCloudinary(file, "agribot/avatars");

      const { error: err } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", userId);

      if (err) throw err;
      setAvatarUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DashboardShell title="Profile" isAdmin={isAdmin}>
      <>
        {error && (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs font-medium text-danger">
            {error}
          </div>
        )}

        <Card className="flex items-center gap-3.5 p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
            id="avatar-input"
          />
          <label
            htmlFor="avatar-input"
            className="group relative flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary ring-2 ring-primary/15"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-6 w-6" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <Camera className="h-4 w-4 text-white" />
            </span>
          </label>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-foreground dark:text-gray-100">
              {email ?? "Loading..."}
            </p>
            <p className="mt-0.5 text-xs text-muted dark:text-gray-400">
              {uploading ? "Uploading photo…" : "Tap photo to change"}
            </p>
          </div>
          {isAdmin && <StatusBadge label="Admin" tone="info" dot={false} />}
        </Card>

        <div className="mt-6">
          <SectionHeading eyebrow="System" title="Account" />
          <div className="space-y-2.5">
            <Card className="flex items-center gap-3 p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground dark:text-gray-100">
                  Connected Robot
                </p>
                <p className="text-xs text-muted dark:text-gray-400">agribot-01</p>
              </div>
              <StatusBadge
                label={robotActive ? "ONLINE" : "OFFLINE"}
                tone={robotActive ? "success" : "muted"}
              />
            </Card>

            <Card className="flex items-center gap-3 p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Info className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground dark:text-gray-100">About</p>
                <p className="text-xs text-muted dark:text-gray-400">AgriBot AI Dashboard v1</p>
              </div>
            </Card>

            {isAdmin && (
              <Link href="/admin">
                <Card className="flex items-center gap-3 p-3.5 transition active:scale-[0.99]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground dark:text-gray-100">
                    Admin Panel
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Card>
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6">
          <SectionHeading eyebrow="Explore" title="More" />
          <div className="space-y-2.5">
            {MORE_LINKS.map(({ href, label, desc, icon: Icon }) => (
              <Link key={href} href={href}>
                <Card className="flex items-center gap-3 p-3.5 transition active:scale-[0.99]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground dark:text-gray-100">{label}</p>
                    <p className="text-xs text-muted dark:text-gray-400">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Card>
              </Link>
            ))}
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
        
