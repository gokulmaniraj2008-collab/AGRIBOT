import {
  Eye,
  Droplet,
  Footprints,
  CloudOff,
  HelpCircle,
  Hand,
  Navigation,
} from "lucide-react";

const problems = [
  { icon: Eye, label: "Manual crop monitoring" },
  { icon: Droplet, label: "Water wastage" },
  { icon: Footprints, label: "Difficult field inspection" },
  { icon: CloudOff, label: "Lack of real-time soil data" },
  { icon: HelpCircle, label: "Crop health uncertainty" },
  { icon: Hand, label: "Manual irrigation" },
  { icon: Navigation, label: "Navigation challenges" },
];

export function ProblemSection() {
  return (
    <section id="problem" className="bg-bg-secondary border-y border-border">
      <div className="mx-auto max-w-6xl px-5 lg:px-8 py-16 lg:py-20">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-primary">The problem</p>
          <h2 className="mt-2 text-2xl lg:text-3xl">
            Farming still runs on guesswork.
          </h2>
        </div>
        <ul className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {problems.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-3 bg-white border border-border rounded-card px-4 py-4 shadow-card"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-bg-secondary text-text-secondary shrink-0">
                <Icon size={18} />
              </span>
              <span className="text-sm font-medium text-text-primary">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
