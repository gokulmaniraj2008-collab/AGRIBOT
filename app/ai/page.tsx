import { AppShell } from "@/components/AppShell";

const insights = [
  { label: "Plant Health", value: "92%", detail: "Healthy crop condition", tone: "text-emerald-600" },
  { label: "Disease Risk", value: "Low", detail: "No high-risk pattern detected", tone: "text-emerald-600" },
  { label: "Water Stress", value: "Moderate", detail: "Consider next irrigation cycle", tone: "text-amber-600" },
  { label: "Growth Condition", value: "Healthy", detail: "Favorable current conditions", tone: "text-emerald-600" },
];

export default function AIPage() {
  return (
    <AppShell>
      <div className="px-5 lg:px-8 py-6 lg:py-8 max-w-7xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-text-secondary">AGRIBOT intelligence</p>
            <h1 className="text-2xl mt-1">AI Insights</h1>
            <p className="mt-1 text-sm text-text-secondary">AI-assisted crop monitoring and farm recommendations.</p>
          </div>
          <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary">DEMO AI ANALYSIS</span>
        </div>

        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {insights.map((item) => (
            <div key={item.label} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs text-text-secondary">{item.label}</p>
              <p className={`mt-2 text-xl font-semibold ${item.tone}`}>{item.value}</p>
              <p className="mt-1 text-xs text-text-secondary">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid lg:grid-cols-3 gap-4">
          <section className="lg:col-span-2 rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold">Latest AI assessment</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Overall crop health is good. Soil moisture is slightly below the configured threshold.
              Consider irrigation during the next monitoring cycle and continue checking Zone B.
            </p>
            <div className="mt-5 grid sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-bg p-4"><p className="text-xs text-text-secondary">Recommendation</p><p className="mt-1 text-sm">Irrigate Zone B</p></div>
              <div className="rounded-xl bg-bg p-4"><p className="text-xs text-text-secondary">Priority</p><p className="mt-1 text-sm">Medium</p></div>
              <div className="rounded-xl bg-bg p-4"><p className="text-xs text-text-secondary">Confidence</p><p className="mt-1 text-sm">Demo estimate</p></div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold">AI workflow</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-text-secondary">Camera images</span><span>Ready</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Sensor data</span><span>Demo</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Crop analysis</span><span>Demo</span></div>
              <div className="flex justify-between"><span className="text-text-secondary">Recommendation</span><span>Ready</span></div>
            </div>
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Safety & reality status</h2>
          <p className="mt-2 text-sm text-text-secondary">
            This page currently displays demo AI analysis. It must not be treated as a real diagnosis or autonomous farm decision until live robot telemetry, image analysis, and the AI backend are connected.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
