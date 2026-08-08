interface LogoProps {
  size?: number;
  animated?: boolean;
  showWordmark?: boolean;
  className?: string;
}

// Signature mark: a leaf sits inside a broken circular ring made of short
// arc segments (robotic/scan-ring geometry) with a small orbiting node,
// standing in for the AI/sensor layer. Green-only, one weight of line.
export function Logo({
  size = 32,
  animated = false,
  showWordmark = false,
  className = "",
}: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* segmented robotic ring */}
        <g stroke="#16A34A" strokeWidth="2.25" strokeLinecap="round">
          <path d="M20 4 A16 16 0 0 1 34.9 14" />
          <path d="M36 20 A16 16 0 0 1 30.9 32.5" />
          <path d="M20 36 A16 16 0 0 1 6.3 28.6" />
          <path d="M4 18 A16 16 0 0 1 11.5 6.3" />
        </g>
        {/* orbiting sensor node */}
        <circle
          cx="34.9"
          cy="14"
          r="2.1"
          fill="#10B981"
          className={animated ? "origin-center animate-pulse" : ""}
        />
        {/* leaf, centered */}
        <path
          d="M20 28c-5.5 0-9.5-4.2-9.5-10.2C10.5 12 15.5 9 20 9s9.5 3 9.5 8.8C29.5 23.8 25.5 28 20 28Z"
          fill="#DCFCE7"
          stroke="#16A34A"
          strokeWidth="1.75"
        />
        <path
          d="M20 27V11"
          stroke="#16A34A"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark && (
        <span className="font-display font-bold text-text-primary tracking-tight text-lg">
          AgriBot <span className="text-primary">AI</span>
        </span>
      )}
    </div>
  );
}
