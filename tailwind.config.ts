import type { Config } from "tailwindcss";

// LIGHT THEME ONLY — no `dark:` variants, no dark palette defined anywhere
// in this file on purpose. Do not add darkMode config.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F8FAF9",
        card: "#FFFFFF",
        "bg-secondary": "#F1F5F3",
        "text-primary": "#111827",
        "text-secondary": "#6B7280",
        border: "#E5E7EB",
        primary: {
          DEFAULT: "#16A34A",
          light: "#DCFCE7",
        },
        emerald: "#10B981",
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",
      },
      fontFamily: {
        display: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(17, 24, 39, 0.04), 0 1px 8px rgba(17, 24, 39, 0.04)",
        "card-hover": "0 2px 4px rgba(17, 24, 39, 0.06), 0 4px 16px rgba(17, 24, 39, 0.06)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
    },
  },
  plugins: [],
};

export default config;
