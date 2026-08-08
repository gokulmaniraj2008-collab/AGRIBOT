"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HelpCircle, Settings } from "lucide-react";
import { Logo } from "./Logo";
import { navGroups } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 bg-white border-r border-border">
      <div className="px-5 h-16 flex items-center border-b border-border">
        <Logo size={28} showWordmark />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 no-scrollbar">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200
                        ${
                          active
                            ? "bg-primary-light text-primary"
                            : "text-text-primary hover:bg-bg-secondary"
                        }`}
                    >
                      <Icon
                        size={18}
                        className={active ? "text-primary" : "text-text-secondary"}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-border space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-text-primary hover:bg-bg-secondary transition-colors duration-200"
        >
          <Settings size={18} className="text-text-secondary" />
          Settings
        </Link>
        <Link
          href="/help"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-text-primary hover:bg-bg-secondary transition-colors duration-200"
        >
          <HelpCircle size={18} className="text-text-secondary" />
          Help
        </Link>
      </div>
    </aside>
  );
}
