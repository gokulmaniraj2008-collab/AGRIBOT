import { Sparkles } from "lucide-react";
import { DemoBadge } from "./DemoBadge";
import type { AIInsight } from "@/types/telemetry";

const riskTone: Record<string, string> = {
  Low: "text-success",
  Moderate: "text-warning",
  High: "text-danger",
};

export function AIInsightCard({ insight }: { insight: AIInsight }) {
  return (
    <div className="bg-white border border-border rounded-card p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-light text-primary">
            <Sparkles size={16} />
          </span>
          <h3 className="text-base font-semibold">AI Insights</h3>
        </div>
        <DemoBadge label="DEMO AI ANALYSIS" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-text-secondary">Plant Health</p>
          <p className="font-semibold text-text-primary">{insight.plantHealthPct}%</p>
        </div>
        <div>
          <p className="text-text-secondary">Disease Risk</p>
          <p className={`font-semibold ${riskTone[insight.diseaseRisk]}`}>
            {insight.diseaseRisk}
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Water Stress</p>
          <p className={`font-semibold ${riskTone[insight.waterStress]}`}>
            {insight.waterStress}
          </p>
        </div>
        <div>
          <p className="text-text-secondary">Growth Condition</p>
          <p className="font-semibold text-text-primary">{insight.growthCondition}</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-text-secondary leading-relaxed border-t border-border pt-4">
        {insight.summary}
      </p>
    </div>
  );
}
