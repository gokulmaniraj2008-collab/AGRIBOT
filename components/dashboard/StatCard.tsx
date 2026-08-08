import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
  sub?: ReactNode;
}

const toneStyles: Record<string, string> = {
  default: "bg-bg-secondary text-text-secondary",
  success: "bg-primary-light text-primary",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  sub,
}: StatCardProps) {
  return (
    <div className="bg-white border border-border rounded-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <span
          className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${toneStyles[tone]}`}
        >
          <Icon size={16} />
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold font-display text-text-primary tracking-tight">
        {value}
      </p>
      {sub && <div className="mt-1.5 text-xs text-text-secondary">{sub}</div>}
    </div>
  );
}
