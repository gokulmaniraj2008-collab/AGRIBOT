"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, StatusBadge } from "@/components/ui-kit";
import type { RobotLog } from "@/lib/types";
import {
  classifyLogKind,
  toneForKind,
  groupLogsIntoSessions,
  findSoilPumpLinks,
  deriveSystemStatus,
  selfCheckState,
  matchesFilter,
  LOG_FILTERS,
  type LogFilter,
  type LogSession,
} from "@/lib/log-grouping";
import {
  Navigation, Radar, Camera, Compass, Droplets, MapPin, ListTree,
  AlertTriangle, ChevronDown, ClipboardList, Trash2,
} from "lucide-react";

const EVENT_META: Record<string, { icon: React.ElementType; color: string }> = {
  ROBOT: { icon: Navigation, color: "#16a34a" },
  ULTRASONIC: { icon: Radar, color: "#6366f1" },
  CAMERA: { icon: Camera, color: "#9333ea" },
  SERVO: { icon: Compass, color: "#0891b2" },
  SOIL: { icon: ListTree, color: "#a16207" },
  PUMP: { icon: Droplets, color: "#0ea5e9" },
  GPS: { icon: MapPin, color: "#dc2626" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** One raw log line — used inside session bodies, expanded failure details, and filtered flat lists. */
function LogRow({ log, note }: { log: RobotLog; note?: string }) {
  const meta = EVENT_META[log.event_type] ?? { icon: ListTree, color: "#6b7280" };
  const Icon = meta.icon;
  const kind = classifyLogKind(log);
  const tone = log.event_type === "CAMERA" && kind === "error" ? "warning" : toneForKind(kind);

  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge label={log.event_type} tone={tone} />
          <span className="shrink-0 font-mono text-[11px] text-muted dark:text-gray-500">
            {clockTime(log.created_at)}
          </span>
        </div>
        <p className="mt-0.5 break-words text-sm text-foreground dark:text-gray-100">
          {log.message}
          {log.value != null && <span className="text-muted"> ({log.value})</span>}
        </p>
        {note && (
          <p className="mt-0.5 text-xs italic text-muted dark:text-gray-400">{note}</p>
        )}
      </div>
    </div>
  );
}

/** Collapsed banner for a recognized ultrasonic/servo failure chain, expandable to the raw events. */
function FailureChainCard({ session }: { session: LogSession }) {
  const [open, setOpen] = useState(false);
  if (!session.failureChain) return null;
  const { anchorIndex, kind } = session.failureChain;
  const anchor = session.logs[anchorIndex];
  const after = session.logs.slice(anchorIndex + 1);

  const title = kind === "ultrasonic" ? "ULTRASONIC SENSOR FAILURE" : "SERVO CONTROL FAILURE";
  const cause =
    kind === "ultrasonic"
      ? "No ultrasonic echo received."
      : "Soil-probe servo did not report as attached/ready.";
  const currentState = after[after.length - 1]?.message ?? "Unknown";

  const actionLines =
    kind === "ultrasonic"
      ? ["Robot stopped", "Servo skipped", "Pump skipped", "GPS location not saved"]
      : ["Robot stopped", "Soil reading skipped", "Pump skipped", "GPS location not saved"];

  return (
    <Card className="overflow-hidden border-l-4 !border-l-danger p-0">
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
          <AlertTriangle size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-danger">⚠️ {title}</p>
            <span className="shrink-0 text-xs text-muted dark:text-gray-500">{timeAgo(anchor.created_at)}</span>
          </div>
          <p className="mt-0.5 text-sm text-foreground dark:text-gray-100">Robot stopped safely.</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted dark:text-gray-500">Cause</p>
              <p className="text-sm text-foreground dark:text-gray-100">{cause}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted dark:text-gray-500">
                Automatic safety actions
              </p>
              <ul className="mt-0.5 space-y-0.5 text-sm text-foreground dark:text-gray-100">
                {actionLines.map((line) => (
                  <li key={line}>✓ {line}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted dark:text-gray-500">
              Current state
            </p>
            <p className="text-sm text-foreground dark:text-gray-100">{currentState}</p>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary"
          >
            {open ? "Hide details" : "Show details"}
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="divide-y divide-border border-t border-border bg-surface/60 px-4 dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-950/40">
          <LogRow log={anchor} />
          {after.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </div>
      )}
    </Card>
  );
}

const SELF_CHECK_ICON = { ok: "✓", warn: "⚠", error: "✕", neutral: "○" } as const;
const SELF_CHECK_COLOR: Record<string, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-danger",
  neutral: "text-muted dark:text-gray-500",
};

/** SYSTEM SELF-CHECK card for a boot session — never treated as a plant-detection event. */
function SelfCheckCard({ session }: { session: LogSession }) {
  const rows = session.logs.filter((l) => l.message !== "System starting");
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList size={16} />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground dark:text-gray-100">SYSTEM SELF-CHECK</p>
            <p className="text-xs text-muted dark:text-gray-400">Startup diagnostics — not a plant detection event</p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted dark:text-gray-500">{timeAgo(session.startedAt)}</span>
      </div>

      <div className="mt-3 divide-y divide-border dark:divide-gray-800">
        {rows.map((log) => {
          const meta = EVENT_META[log.event_type] ?? { icon: ListTree, color: "#6b7280" };
          const Icon = meta.icon;
          const { state } = selfCheckState(log.message);
          return (
            <div key={log.id} className="flex items-center gap-3 py-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
              >
                <Icon size={14} />
              </span>
              <span className="w-24 shrink-0 text-xs font-semibold text-foreground dark:text-gray-100">
                {log.event_type}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground dark:text-gray-100">
                {log.message}
              </span>
              <span className={`shrink-0 text-sm font-bold ${SELF_CHECK_COLOR[state]}`}>
                {SELF_CHECK_ICON[state]}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Normal (successful, unclear-outcome, or "other"/legacy) session — plain chronological list of its events. */
function SessionCard({ session }: { session: LogSession }) {
  const links = useMemo(() => findSoilPumpLinks(session.logs), [session.logs]);
  const heading =
    session.kind === "patrol"
      ? session.plantId != null && session.plantId > 0
        ? `Plant ${session.plantId} — detection attempt`
        : "Detection attempt"
      : "Earlier activity";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {session.outcome === "success" && <StatusBadge label="Completed" tone="success" />}
          <p className="text-sm font-bold text-foreground dark:text-gray-100">{heading}</p>
        </div>
        <span className="shrink-0 text-xs text-muted dark:text-gray-500">{timeAgo(session.startedAt)}</span>
      </div>
      <div className="mt-1 divide-y divide-border dark:divide-gray-800">
        {session.logs.map((log) => (
          <LogRow key={log.id} log={log} note={links[log.id]?.note} />
        ))}
      </div>
    </Card>
  );
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "muted" | "info"> = {
  MOVING: "success",
  STOPPED: "muted",
  WAITING: "warning",
  STARTING: "info",
  OK: "success",
  READY: "success",
  "CONTROL READY": "success",
  ERROR: "danger",
  FIXED: "success",
  ACQUIRING: "warning",
  UNAVAILABLE: "muted",
  CONNECTED: "success",
  "NOT CONNECTED": "muted",
  OPTIONAL: "muted",
  WATERING: "info",
  "NOT VERIFIED": "warning",
  Unknown: "muted",
};

function StatusSummary({ logs }: { logs: RobotLog[] }) {
  const status = useMemo(() => deriveSystemStatus(logs), [logs]);
  const rows: { label: string; value: string }[] = [
    { label: "Robot", value: status.robot },
    { label: "Ultrasonic", value: status.ultrasonic },
    { label: "Servo", value: status.servo },
    { label: "Soil", value: status.soil },
    { label: "Camera", value: status.camera },
    { label: "GPS", value: status.gps },
    { label: "Pump", value: status.pump },
  ];

  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <span
            key={r.label}
            className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs dark:border-gray-800"
          >
            <span className="font-semibold text-foreground dark:text-gray-100">{r.label}</span>
            <StatusBadge label={r.value} tone={STATUS_TONE[r.value] ?? "muted"} />
          </span>
        ))}
      </div>
    </Card>
  );
}

function FilterBar({ active, onChange }: { active: LogFilter; onChange: (f: LogFilter) => void }) {
  return (
    <div className="mb-4 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {LOG_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            active === f
              ? "bg-primary text-white"
              : "bg-white text-muted hover:bg-surface dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
          } border border-border dark:border-gray-800`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

/**
 * Admin-only control. Visible to everyone in the component tree, but only
 * ever renders its button for a confirmed admin — regular users see
 * nothing extra, and the actual delete is still gated by Supabase RLS on
 * the robot_logs table (the UI check alone doesn't grant access).
 */
function AdminDeleteAllLogs({
  isAdmin,
  disabled,
  onDeleteAll,
}: {
  isAdmin: boolean;
  disabled: boolean;
  onDeleteAll: () => void;
}) {
  if (!isAdmin) return null;
  return (
    <button
      type="button"
      onClick={onDeleteAll}
      disabled={disabled}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-danger/30 bg-white px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-50 dark:bg-gray-900"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {disabled ? "Deleting…" : "Delete all logs"}
    </button>
  );
}

export default function LogsClient({ initialLogs }: { initialLogs: RobotLog[] }) {
  const supabase = createClient();
  // Kept newest-first throughout, deduplicated by id (the primary key —
  // never by message text, since identical messages can legitimately
  // repeat at different times).
  const [logs, setLogs] = useState<RobotLog[]>(initialLogs);
  const [filter, setFilter] = useState<LogFilter>("ALL");
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Same "check profiles.role" pattern used on the Profile and Admin pages
  // — the button only ever renders for a confirmed admin.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single<{ role: string }>();
      setIsAdmin(profile?.role === "admin");
    });
  }, [supabase]);

  async function deleteAllLogs() {
    const confirmed = window.confirm(
      "Delete ALL activity logs? This removes the full patrol/detection history from Supabase and cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError(null);
    // robot_logs has no natural "delete everything" filter, so this uses
    // the standard Supabase workaround (id >= 0 matches every row) rather
    // than an unfiltered delete. Actual permission is enforced by the
    // table's RLS delete policy, not by this UI check.
    const { error: err } = await supabase.from("robot_logs").delete().gte("id", 0);
    if (err) {
      setDeleteError(err.message);
    } else {
      setLogs([]);
    }
    setDeleting(false);
  }

  useEffect(() => {
    const channel = supabase
      .channel("robot_logs_activity_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "robot_logs" },
        (payload) => {
          const incoming = payload.new as RobotLog;
          setLogs((prev) => {
            if (prev.some((l) => l.id === incoming.id)) return prev; // dedupe by id
            const next = [incoming, ...prev];
            next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const sessions = useMemo(() => groupLogsIntoSessions(logs), [logs]);
  const filteredFlat = useMemo(
    () => (filter === "ALL" ? [] : logs.filter((l) => matchesFilter(l, filter))),
    [logs, filter]
  );

  return (
    <DashboardShell title="Activity Log" subtitle="Detect → verify → probe → water → save">
      {logs.length === 0 ? (
        <Card className="p-4 text-sm text-muted">
          No activity logged yet — logs appear here as the robot detects and
          checks plants.
        </Card>
      ) : (
        <>
          {isAdmin && (
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted dark:text-gray-400">
                Admin — you can clear the full activity history below.
              </span>
              <AdminDeleteAllLogs isAdmin={isAdmin} disabled={deleting} onDeleteAll={deleteAllLogs} />
            </div>
          )}
          {deleteError && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-xs font-medium text-danger">
              {deleteError}
            </div>
          )}

          <StatusSummary logs={logs} />
          <FilterBar active={filter} onChange={setFilter} />

          {filter === "ALL" ? (
            <div className="space-y-3">
              {sessions.map((session) => {
                if (session.kind === "self_check") {
                  return <SelfCheckCard key={session.id} session={session} />;
                }
                if (session.failureChain) {
                  return <FailureChainCard key={session.id} session={session} />;
                }
                return <SessionCard key={session.id} session={session} />;
              })}
            </div>
          ) : filteredFlat.length === 0 ? (
            <Card className="p-4 text-sm text-muted">No matching activity for this filter yet.</Card>
          ) : (
            <Card className="divide-y divide-border p-3 dark:divide-gray-800">
              {filteredFlat.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </Card>
          )}
        </>
      )}
    </DashboardShell>
  );
}
