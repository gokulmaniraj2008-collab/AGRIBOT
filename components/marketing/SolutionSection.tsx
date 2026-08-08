import {
  Radar,
  Leaf,
  Sprout,
  Route,
  Droplets,
  Satellite,
} from "lucide-react";

const solutions = [
  {
    icon: Radar,
    title: "Smart Monitoring",
    description: "Continuous field readings from onboard sensors, not periodic manual checks.",
  },
  {
    icon: Leaf,
    title: "AI Plant Analysis",
    description: "Capture a leaf image and get a health read with an estimated confidence.",
  },
  {
    icon: Sprout,
    title: "Soil Intelligence",
    description: "Live moisture, temperature and trend data across every zone.",
  },
  {
    icon: Route,
    title: "Autonomous Navigation",
    description: "GPS-guided movement through crop rows with obstacle avoidance.",
  },
  {
    icon: Droplets,
    title: "Smart Irrigation",
    description: "Threshold-based watering by zone, manual or fully automatic.",
  },
  {
    icon: Satellite,
    title: "GPS Tracking",
    description: "Know exactly where the robot is and where it's been.",
  },
];

export function SolutionSection() {
  return (
    <section id="solution" className="mx-auto max-w-6xl px-5 lg:px-8 py-16 lg:py-20">
      <div className="max-w-xl">
        <p className="text-sm font-semibold text-primary">The solution</p>
        <h2 className="mt-2 text-2xl lg:text-3xl">
          One robot, six ways to know your field.
        </h2>
      </div>
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {solutions.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-card border border-border bg-white p-6 shadow-card hover:shadow-card-hover transition-shadow duration-200"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-light text-primary">
              <Icon size={20} />
            </span>
            <h3 className="mt-4 text-base font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">
              {description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
