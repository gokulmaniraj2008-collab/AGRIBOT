"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, IconTile } from "@/components/ui-kit";
import type { Profile } from "@/lib/types";
import { Users, ShieldCheck, ArrowLeft } from "lucide-react";

export default function AdminUsersPage() {
  const supabase = createClient();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setCurrentUserId(user?.id ?? null);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: true })
        .returns<Profile[]>();
      if (!cancelled && data) setProfiles(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function toggleRole(profile: Profile) {
    if (profile.id === currentUserId) return;
    const nextRole = profile.role === "admin" ? "user" : "admin";
    setBusy(`role-${profile.id}`);
    setError(null);
    const { data, error: err } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", profile.id)
      .select()
      .single<Profile>();
    if (err) setError(err.message);
    else if (data)
      setProfiles((prev) =>
        prev.map((p) => (p.id === data.id ? data : p))
      );
    setBusy(null);
  }

  return (
    <DashboardShell title="Users" subtitle="Admin" isAdmin>
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
          <div className="mb-3 flex items-center gap-2.5">
            <IconTile icon={Users} size={32} />
            <span className="text-sm font-semibold text-foreground dark:text-gray-100">
              {profiles.length} {profiles.length === 1 ? "user" : "users"}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
            {profiles.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between py-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground dark:text-gray-100">
                    {p.email ?? p.id}
                    {p.id === currentUserId && (
                      <span className="ml-1.5 font-normal text-muted">(you)</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-muted dark:text-gray-400">
                    joined {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => toggleRole(p)}
                  disabled={p.id === currentUserId || busy === `role-${p.id}`}
                  className={
                    p.role === "admin"
                      ? "flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primaryDark disabled:opacity-50"
                      : "flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 font-semibold text-muted transition hover:bg-background disabled:opacity-50 dark:border-gray-800"
                  }
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {p.role === "admin" ? "Admin" : "Make admin"}
                </button>
              </div>
            ))}
          </div>
        </Card>
      </>
    </DashboardShell>
  );
}
