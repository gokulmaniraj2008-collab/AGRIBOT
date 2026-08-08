import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        foreground: "#111827",
        surface: "#f8faf9",
        border: "#e6ebe8",
        primary: "#16a34a",
        primaryDark: "#15803d",
        secondary: "#10b981",
        info: "#2563eb",
        warning: "#f59e0b",
        danger: "#ef4444",
        success: "#22c55e",
        muted: "#6b7280",
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
      },
      keyframes: {
        "logo-pop": {
          "0%": { opacity: "0", transform: "scale(0.85) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "loading-bar": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
      },
      animation: {
        "logo-pop": "logo-pop 0.7s ease-out both",
        "fade-in": "fade-in 0.6s ease-out both",
        "loading-bar": "loading-bar 1.3s ease-in-out 0.2s both",
      },
    },
  },
  plugins: [],
};
export default config;
