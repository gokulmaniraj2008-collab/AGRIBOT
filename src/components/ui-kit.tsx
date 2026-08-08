"use client";

import Link from "next/link";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Sparkles, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      {children}
    </div>
  );
}

/** Small pill badge for status text — "ONLINE", "Connected", "Good", etc. */
export function StatusBadge({
  label,
  tone = "success",
  dot = true,
}: {
  label: string;
  tone?: "success" | "warning" | "danger" | "muted" | "info";
  dot?: boolean;
}) {
  const styles: Record<string, string> = {
    success: "bg-success/10 text-primaryDark",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
    muted: "bg-gray-100 text-muted dark:bg-gray-800 dark:text-gray-400",
    info: "bg-info/10 text-info",
  };
  const dotStyles: Record<string, string> = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    muted: "bg-gray-400",
    info: "bg-info",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[tone]}`} />}
      {label}
    </span>
  );
}

/** Consistent sub-page header: back/menu slot, title, action slot */
export function PageHeader({
  title,
  leading,
  trailing,
}: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {leading}
        <h1 className="text-lg font-bold text-foreground dark:text-gray-100">{title}</h1>
      </div>
      {trailing}
    </div>
  );
}

/** Small rounded icon tile used for metric labels, telemetry rows, quick actions */
export function IconTile({
  icon: Icon,
  color = "#16a34a",
  size = 28,
}: {
  icon: React.ElementType;
  color?: string;
  size?: number;
}) {
  return (
    <span
      className="flex items-center justify-center rounded-lg"
      style={{ width: size, height: size, backgroundColor: `${color}1a`, color }}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  desc,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-3">
      {eyebrow && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          {eyebrow}
        </p>
      )}
      <h2 className="text-lg font-bold text-foreground dark:text-gray-100">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-muted dark:text-gray-400">{desc}</p>}
    </div>
  );
}

export function AIBanner({
  text,
  cta,
  href = "/assistant",
}: {
  text: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-emerald-600 p-4 text-white shadow-md">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium leading-snug">{text}</p>
      </div>
      {cta && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/30"
        >
          {cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export function MiniChart({
  data,
  color = "#16a34a",
  height = 48,
}: {
  data: { v: number | null }[];
  color?: string;
  height?: number;
}) {
  if (!data.length) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#grad-${color.replace("#", "")})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Circular progress ring for percentage-based metrics (soil moisture, battery, water tank, humidity) */
export function ProgressRing({
  percent,
  color = "#16a34a",
  size = 88,
  stroke = 8,
  children,
}: {
  percent: number;
  color?: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-gray-100 dark:text-gray-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Maps a hex color to a soft tinted gradient background, matching the reference design's tinted cards */
function tintGradient(color: string) {
  return {
    backgroundImage: `linear-gradient(135deg, ${color}1f 0%, ${color}08 100%)`,
  };
}

export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  trend,
  color = "#16a34a",
  data,
  percent,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  trend?: "up" | "down" | null;
  color?: string;
  data?: { v: number | null }[];
  /** If provided (0-100), renders a progress ring instead of a sparkline */
  percent?: number;
  onClick?: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-4 shadow-sm transition"
      style={tintGradient(color)}
    >
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left ${onClick ? "cursor-pointer active:scale-[0.98]" : ""}`}
        disabled={!onClick}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}26`, color }}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-medium text-foreground/80 dark:text-gray-300">{label}</span>
          </span>
          {trend && (
            <span className={trend === "up" ? "text-emerald-500" : "text-amber-500"}>
              {trend === "up" ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </div>

        {percent != null ? (
          <div className="mt-2 flex items-center justify-center">
            <ProgressRing percent={percent} color={color} size={84} stroke={7}>
              <span className="text-lg font-bold text-foreground dark:text-gray-100">
                {value}
                {unit && <span className="text-[10px] font-medium text-muted dark:text-gray-400">{unit}</span>}
              </span>
            </ProgressRing>
          </div>
        ) : (
          <>
            <p className="mt-2.5 text-xl font-bold text-foreground dark:text-gray-100">
              {value}
              {unit && <span className="ml-0.5 text-xs font-medium text-muted dark:text-gray-400">{unit}</span>}
            </p>
            {data && (
              <div className="mt-1 -mx-1">
                <MiniChart data={data} color={color} height={36} />
              </div>
            )}
          </>
        )}
      </button>
    </div>
  );
}
