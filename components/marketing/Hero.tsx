import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Compass } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-light text-primary text-xs font-semibold">
            Robotics × AI × IoT
          </span>
          <h1 className="mt-5 font-display text-4xl sm:text-5xl lg:text-[3.25rem] leading-[1.08] font-extrabold tracking-tight text-text-primary">
            The Future of Farming Is Autonomous.
          </h1>
          <p className="mt-5 text-base lg:text-lg text-text-secondary leading-relaxed max-w-lg">
            AgriBot AI combines robotics, computer vision, IoT sensors and
            intelligent automation to help farmers monitor and manage their
            fields more efficiently.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/dashboard">
              <Button size="lg" icon={<ArrowRight size={18} />}>
                Launch Dashboard
              </Button>
            </Link>
            <a href="#solution">
              <Button variant="secondary" size="lg" icon={<Compass size={18} />}>
                Explore AgriBot
              </Button>
            </a>
          </div>
        </div>

        <RobotFieldGraphic />
      </div>
    </section>
  );
}

// Illustrative field + robot diagram. Explicitly a schematic, not a stock
// photo standing in for real product photography.
function RobotFieldGraphic() {
  return (
    <div className="relative rounded-card border border-border bg-white shadow-card p-6 lg:p-8">
      <svg viewBox="0 0 480 360" className="w-full h-auto" aria-hidden="true">
        <rect x="0" y="0" width="480" height="360" rx="16" fill="#F1F5F3" />
        {/* crop rows */}
        {[70, 130, 190, 250, 310, 370, 430].map((x) => (
          <line
            key={x}
            x1={x}
            y1="40"
            x2={x - 60}
            y2="320"
            stroke="#DCFCE7"
            strokeWidth="14"
            strokeLinecap="round"
          />
        ))}
        {/* robot body */}
        <g transform="translate(190,150)">
          <rect x="-46" y="-18" width="92" height="52" rx="10" fill="#FFFFFF" stroke="#16A34A" strokeWidth="2.5" />
          <circle cx="-28" cy="46" r="14" fill="#111827" />
          <circle cx="28" cy="46" r="14" fill="#111827" />
          <rect x="-46" y="10" width="92" height="14" fill="#111827" opacity="0.06" />
          {/* camera mast */}
          <line x1="0" y1="-18" x2="0" y2="-46" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy="-52" r="8" fill="#16A34A" />
          <circle cx="0" cy="-52" r="3" fill="#FFFFFF" />
          {/* status light */}
          <circle cx="30" cy="-4" r="4" fill="#22C55E" />
        </g>
        {/* GPS route dots */}
        {[[190, 150], [240, 150], [290, 145], [340, 148]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#10B981" opacity={0.7 - i * 0.12} />
        ))}
      </svg>
      <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white border border-border rounded-full px-2.5 py-1 text-xs font-medium text-text-secondary shadow-card">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        Robot online
      </div>
    </div>
  );
}
