import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        codex: {
          ink: "var(--codex-ink)",
          muted: "var(--codex-muted)",
          faint: "var(--codex-faint)",
          surface: "var(--codex-surface)",
          accent: "var(--codex-accent)",
          "accent-soft": "var(--codex-accent-soft)",
          ice: "var(--codex-ice)",
          dark: "var(--codex-dark)",
        },
        brand: {
          50: "#eef4ff",
          100: "#dbe8ff",
          200: "#c7d7ff",
          300: "#aeb8ff",
          400: "#8397ff",
          500: "#5b7cff",
          600: "#4868e5",
          700: "#3853bd",
          800: "#2e4292",
          900: "#26366e",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
