"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/lib/theme-context";
import {
  LayoutDashboard, Map, Sparkles, Leaf,
  Bell, User, Sun, Moon, Menu, X, BarChart3, Camera, ShieldCheck,
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
  const [menuOpen, setMenuOpen] = useState(false);


  return (
    <div className="min-h-screen bg-surface dark:bg-gray-950">
      <div className="flex-1">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-border bg-white/90 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMenuOpen((open) => !open)} className="hidden rounded-lg p-2 text-muted transition hover:bg-surface dark:text-gray-400 dark:hover:bg-gray-800 md:inline-flex" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
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
        {menuOpen && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 hidden bg-black/20 md:block" onClick={() => setMenuOpen(false)} />
            <aside className="fixed left-4 top-[76px] z-50 hidden w-72 rounded-2xl border border-border bg-white p-2 shadow-2xl dark:border-gray-800 dark:bg-gray-900 md:block">
              <p className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">AgriBot Menu</p>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><LayoutDashboard className="h-4 w-4" />Dashboard</Link>
              <Link href="/field" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><Map className="h-4 w-4" />Farm</Link>
              <Link href="/alerts" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><Bell className="h-4 w-4" />Alerts</Link>
              <Link href="/analytics" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><BarChart3 className="h-4 w-4" />Analytics</Link>
              <Link href="/camera" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><Camera className="h-4 w-4" />Camera</Link>
              <Link href="/assistant" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><Sparkles className="h-4 w-4" />AI Assistant</Link>
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><User className="h-4 w-4" />Profile</Link>
              {isAdmin && <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-surface dark:text-gray-200 dark:hover:bg-gray-800"><ShieldCheck className="h-4 w-4" />Admin Panel</Link>}
            </aside>
          </>
        )
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





       




