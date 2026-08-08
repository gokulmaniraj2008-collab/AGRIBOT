import { AppShell } from "@/components/AppShell";

// Placeholder only. Confirms Sidebar + MobileBottomNav render and route
// correctly. Farm Health / Soil / Battery / GPS cards, alerts, and charts
// are scoped for the next build phase, not this one.
export default function DashboardPage() {
  return (
    <AppShell>
      <div className="px-5 lg:px-8 py-8">
        <h1 className="text-2xl">Dashboard</h1>
        <p className="mt-2 text-sm text-text-secondary max-w-md">
          Navigation shell is wired up. Dashboard cards, alerts, and charts
          come in the next build phase.
        </p>
      </div>
    </AppShell>
  );
}
