import { AlertTriangle, Info, AlertOctagon } from "lucide-react";
import type { AlertItem, AlertLevel } from "@/types/telemetry";

const levelConfig: Record<
  AlertLevel,
  { icon: typeof AlertTriangle; classes: string }
> = {
  critical: { icon: AlertOctagon, classes: "bg-danger/10 text-danger" },
  warning: { icon: AlertTriangle, classes: "bg-warning/10 text-warning" },
  info: { icon: Info, classes: "bg-info/10 text-info" },
};

export function AlertsCard({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="bg-white border border-border rounded-card p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">Alerts</h3>
        <a href="/alerts" className="text-xs font-medium text-primary hover:underline">
          View all
        </a>
      </div>
      {alerts.length === 0 ? (
        <p className="text-sm text-text-secondary">No active alerts.</p>
      ) : (
        <ul className="space-y-3">
          {alerts.map((alert) => {
            const { icon: Icon, classes } = levelConfig[alert.level];
            return (
              <li key={alert.id} className="flex items-start gap-3">
                <span
                  className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${classes}`}
                >
                  <Icon size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {alert.title}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {alert.timeAgo}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
