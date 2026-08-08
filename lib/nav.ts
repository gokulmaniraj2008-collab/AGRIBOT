import {
  LayoutDashboard,
  Map,
  Gamepad2,
  Camera,
  Satellite,
  Sparkles,
  Leaf,
  Droplets,
  Gauge,
  Bell,
  History,
  BarChart3,
  Settings,
  HelpCircle,
} from "lucide-react";
import type { NavGroup, NavItem } from "@/types/nav";

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Farm", href: "/farm", icon: Map },
    ],
  },
  {
    label: "Robot",
    items: [
      { label: "Robot Control", href: "/robot", icon: Gamepad2 },
      { label: "Camera", href: "/camera", icon: Camera },
      { label: "GPS", href: "/gps", icon: Satellite },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "AI Insights", href: "/insights", icon: Sparkles },
      { label: "Plant Analysis", href: "/plant-analysis", icon: Leaf },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { label: "Sensors", href: "/sensors", icon: Gauge },
      { label: "Irrigation", href: "/irrigation", icon: Droplets },
      { label: "Alerts", href: "/alerts", icon: Bell },
    ],
  },
  {
    label: "System",
    items: [
      { label: "History", href: "/history", icon: History },
      { label: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
];

export const bottomNavItems: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Farm", href: "/farm", icon: Map },
  { label: "Robot", href: "/robot", icon: Gamepad2 },
  { label: "AI", href: "/insights", icon: Sparkles },
  { label: "More", href: "/settings", icon: Settings },
];

export const utilityNavItems: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/help", icon: HelpCircle },
];
