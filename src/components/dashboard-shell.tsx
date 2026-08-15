"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/lib/theme-context";
import {
  LayoutDashboard, Map, Bot, Camera, LineChart, Sparkles, Leaf,
  Bell, User, Shield, Menu, X, Sun, Moon, LogOut, Droplet, History, Brain, Wifi, MessageSquare, Cpu,
} from "lucide-react";

const BOTTOM_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/field", label: "Farm", icon: Map },
  { href: "/robot", label: "Robot", icon: Bot },
  { href: "/assistant", label: "AI", icon: Sparkles },
];

const NAV_SECTIONS = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Field",
    items: [
      { href: "/field", label: "Field Map", icon: Map },
      { href: "/robot", label: "Robot Control", icon: Bot },
      { href: "/device", label: "ESP32 Device", icon: Cpu },
      { href: "/irrigation", label: "Smart Irrigation", icon: Droplet },
      { href: "/camera", label: "Camera Feed", icon: Camera },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", label: "Monitoring", icon: LineChart },
      { href: "/insights", label: "AI Insights", icon: Brain },
      { href: "/recommendations", label: "Recommendations", icon: Leaf },
      { href: "/assistant", label: "AI Assistant", icon: Sparkles },
      { href: "/alerts", label: "Alerts", icon: Bell },
      { href: "/history", label: "Robot History", icon: History },
    ],
  },
  { label: "Account", items: [
    { href: "/profile", label: "Profile", icon: User },
  ] },
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
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const sections = isAdmin
    ? [...NAV_SECTIONS, { label: "Admin", items: [{ href: "/admin", label: "Admin Panel", icon: Shield }] }]
    : NAV_SECTIONS;

  const NavLinks = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      {sections.map((section) => (
        <div key={section.label} className="mb-4">
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted dark:text-gray-500">
              {section.label}
            </p>
          )}
          {section.items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                onClick={() => setMobileOpen(false)}
                className={`mb-0.5 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-primary text-white shadow-sm shadow-primary/30"
                    : "text-foreground/80 hover:bg-surface dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
                {!collapsed && label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-surface dark:bg-gray-950 md:flex">
      {/* Desktop sidebar — hidden by default, opens on menu click */}
      {sidebarOpen && (
        <aside className="hidden w-60 shrink-0 border-r border-border bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:block">
          <div className="mb-6 flex items-center justify-between px-1">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <Leaf className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-bold text-foreground dark:text-gray-100">
                Agri<span className="text-primary">Bot</span>
              </span>
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label="Close menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>

          <NavLinks />

          <button
            onClick={handleLogout}
            className="mt-4 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </aside>
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-white p-4 dark:bg-gray-900">
            <div className="mb-6 flex items-center justify-between px-1">
              <span className="text-sm font-bold text-foreground dark:text-gray-100">
                Agri<span className="text-primary">Bot</span>
              </span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5 text-muted" />
              </button>
            </div>
            <NavLinks />
            <button
              onClick={handleLogout}
              className="mt-4 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted dark:text-gray-400"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </aside>
        </div>
      )}

      <div className="flex-1">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-border bg-white/90 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="hidden rounded-lg p-1.5 text-muted hover:bg-surface dark:text-gray-400 dark:hover:bg-gray-800 md:block"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              )}
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

        <button
          onClick={() => setMobileOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] text-muted dark:text-gray-400"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>
    </div>
  );
    }




       


            
