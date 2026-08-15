"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DeviceMessage } from "@/lib/types";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, SectionHeading } from "@/components/ui-kit";
import { Cpu, Globe, Send, AlertTriangle, CheckCircle2, Info } from "lucide-react";

const ROBOT_ID = "agribot-01";
const MAX_ROWS = 50;

function timeAgo(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

const LEVEL_STYLE: Record<DeviceMessage["level"], { color: string; icon: React.ElementType }> = {
  info: { color: "#0ea5e9", icon: Info },
  success: { color: "#16a34a", icon: CheckCircle2 },
  warning: { color: "#f59e0b", icon: AlertTriangle },
  error: { color: "#dc2626", icon: AlertTriangle },
};

export default function MessagesPage() {
  const supabase = useRef(createClient()).current;
  const [messages, setMessages] = useState<DeviceMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("device_messages")
        .select("*")
        .eq("robot_id", ROBOT_ID)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS)
        .returns<DeviceMessage[]>();
      if (!cancelled && data) setMessages(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel("device_messages_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "device_messages", filter: `robot_id=eq.${ROBOT_ID}` },
        (payload) => {
          const row = payload.new as DeviceMessage;
          setMessages((prev) => [row, ...prev].slice(0, MAX_ROWS));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const { error: insertError } = await supabase.from("device_messages").insert({
      robot_id: ROBOT_ID,
      origin: "website",
      level: "info",
      message: text,
    });
    setSending(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setDraft("");
  }

  return (
    <DashboardShell title="Messages" subtitle={ROBOT_ID}>
      <>
        <SectionHeading
          eyebrow="Two-way Log"
          title="ESP32 ⇄ Website"
          desc="Messages the robot sends up, and notes you send down. The robot polls for new website messages every few seconds."
        />

        <Card className="p-3">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Send a note to the robot…"
              className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted dark:border-white/10 dark:text-gray-100"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !draft.trim()}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </Card>

        <div className="mt-4 flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-muted dark:text-gray-400">
              No messages yet.
            </p>
          )}
          {messages.map((m) => {
            const style = LEVEL_STYLE[m.level];
            const Icon = style.icon;
            const fromEsp32 = m.origin === "esp32";
            return (
              <Card key={m.id} className="p-3">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${style.color}1a`, color: style.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted dark:text-gray-400">
                      {fromEsp32 ? <Cpu className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                      {fromEsp32 ? "ESP32" : "You"}
                      <span className="text-muted/50 dark:text-gray-600">
                        · {timeAgo(m.created_at, now)} · {absoluteTime(m.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-foreground dark:text-gray-100">{m.message}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </>
    </DashboardShell>
  );
              }
