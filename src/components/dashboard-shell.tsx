"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme-context";
import {
  LayoutDashboard, Map, Sparkles, Leaf,
  Bell, User, Sun, Moon,
} from "lucide-react";

const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/field", label: "Farm", icon: Map },
  { href: "/assistant", label: "AI", icon: Sparkles },
  { href: "/profile", label: "Profile", icon: User },
];

export function DashboardShell({
  title,
  subtitle,
  online,
  isAdmin,
  children,
}: {
  title: string;
  subtitle?: string;
  online?: boolean;
  isAdmin?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  // isAdmin is accepted for backwards compatibility with existing callers
  // (the sidebar used to show an Admin Panel link); it's currently unused
  // now that the drawer nav has been removed.
  void isAdmin;

  return (
    <div className="min-h-screen bg-surface dark:bg-gray-950">
      <div className="flex-1">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-border bg-white/90 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                <Leaf className="h-4.5 w-4.5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground dark:text-gray-100">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-0.5 text-xs font-medium text-muted dark:text-gray-400">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {online !== undefined && (
                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    online
                      ? "bg-primary/10 text-primary"
                      : "bg-gray-100 text-muted dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-primary" : "bg-gray-400"}`} />
                  {online ? "Online" : "Offline"}
                </span>
              )}
              <Link
                href="/alerts"
                className={`rounded-lg p-2 transition ${
                  pathname === "/alerts"
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
                aria-label="Alerts"
              >
                <Bell className="h-4 w-4" />
              </Link>
              <button
                onClick={toggleTheme}
                className="rounded-lg p-2 text-muted hover:bg-surface dark:text-gray-400 dark:hover:bg-gray-800"
                aria-label="Toggle theme"
              >
                {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav — floating pill, brand icon anchor */}
      <nav className="fixed inset-x-4 bottom-4 z-30 flex items-center gap-1 rounded-full bg-white p-1.5 shadow-lg shadow-black/10 dark:bg-gray-900 md:hidden">
        <Link
          href="/dashboard"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm"
          aria-label="AgriBot Home"
        >
          <Leaf className="h-5 w-5" />
        </Link>

        {BOTTOM_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] ${
                active ? "text-primary" : "text-muted dark:text-gray-400"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}





       




