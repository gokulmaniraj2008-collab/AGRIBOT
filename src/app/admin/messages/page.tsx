"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, IconTile } from "@/components/ui-kit";
import type { DeviceMessage } from "@/lib/types";
import {
  ArrowLeft,
  MessageSquare,
  Trash2,
  RefreshCw,
  Info,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Globe,
} from "lucide-react";

const ROBOT_ID = "agribot-01";
const PAGE_SIZE = 50;

const LEVEL_STYLE: Record<DeviceMessage["level"], { color: string; icon: React.ElementType }> = {
  info: { color: "#0ea5e9", icon: Info },
  success: { color: "#16a34a", icon: CheckCircle2 },
  warning: { color: "#f59e0b", icon: AlertTriangle },
  error: { color: "#dc2626", icon: AlertTriangle },
};

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminMessagesPage() {
  const supabase = createClient();
  const router = useRouter();

  const [messages, setMessages] = useState<DeviceMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (offset: number) => {
      const { data, error: err } = await supabase
        .from("device_messages")
        .select("*")
        .eq("robot_id", ROBOT_ID)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
        .returns<DeviceMessage[]>();
      if (err) {
        setError(err.message);
        return [];
      }
      return data ?? [];
    },
    [supabase]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await loadPage(0);
      if (cancelled) return;
      setMessages(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  async function refresh() {
    setBusy("refresh");
    setError(null);
    const rows = await loadPage(0);
    setMessages(rows);
    setHasMore(rows.length === PAGE_SIZE);
    setBusy(null);
  }

  async function loadMore() {
    setBusy("more");
    const rows = await loadPage(messages.length);
    setMessages((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setBusy(null);
  }

  async function deleteMessage(id: number) {
    setBusy(`del-${id}`);
    setError(null);
    const { error: err } = await supabase.from("device_messages").delete().eq("id", id);
    if (err) setError(err.message);
    else setMessages((prev) => prev.filter((m) => m.id !== id));
    setBusy(null);
  }

  async function clearAll() {
    setBusy("clear-all");
    setError(null);
    const { error: err } = await supabase
      .from("device_messages")
      .delete()
      .eq("robot_id", ROBOT_ID);
    if (err) setError(err.message);
    else {
      setMessages([]);
      setHasMore(false);
    }
    setBusy(null);
  }

  return (
    <DashboardShell title="Device Messages" subtitle="Admin" isAdmin>
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
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <IconTile icon={MessageSquare} size={32} />
              <span className="text-sm font-semibold text-foreground dark:text-gray-100">
                All Messages
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                disabled={busy === "refresh"}
                className="text-muted transition hover:text-foreground"
                aria-label="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${busy === "refresh" ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={clearAll}
                disabled={busy === "clear-all" || messages.length === 0}
                className="flex items-center gap-1 rounded-lg border border-danger/30 bg-white px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/5 disabled:opacity-50 dark:bg-gray-900"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {busy === "clear-all" ? "Clearing…" : "Clear all"}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-muted dark:text-gray-400">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted dark:text-gray-400">No messages.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border dark:divide-gray-800">
              {messages.map((m) => {
                const level = LEVEL_STYLE[m.level];
                const LevelIcon = level.icon;
                const OriginIcon = m.origin === "esp32" ? Cpu : Globe;
                return (
                  <div key={m.id} className="flex items-start gap-2.5 py-3">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${level.color}1a`, color: level.color }}
                    >
                      <LevelIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs font-medium text-foreground dark:text-gray-100">
                        {m.message}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted dark:text-gray-400">
                        <OriginIcon className="h-3 w-3" />
                        {m.origin} · {absoluteTime(m.created_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteMessage(m.id)}
                      disabled={busy === `del-${m.id}`}
                      className="shrink-0 text-muted transition hover:text-danger disabled:opacity-50"
                      aria-label="Delete message"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && !loading && (
            <button
              onClick={loadMore}
              disabled={busy === "more"}
              className="mt-3 w-full rounded-xl border border-border bg-white py-2.5 text-xs font-semibold text-foreground transition hover:bg-background disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {busy === "more" ? "Loading…" : "Load more"}
            </button>
          )}
        </Card>
      </>
    </DashboardShell>
  );
     }
                                           
