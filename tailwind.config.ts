import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const cssVarColor = (name: string) => `hsl(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: cssVarColor("--border"),
        input: cssVarColor("--input"),
        ring: cssVarColor("--ring"),
        background: cssVarColor("--background"),
        foreground: cssVarColor("--foreground"),
        primary: {
          DEFAULT: cssVarColor("--primary"),
          foreground: cssVarColor("--primary-foreground"),
        },
        secondary: {
          DEFAULT: cssVarColor("--secondary"),
          foreground: cssVarColor("--secondary-foreground"),
        },
        destructive: {
          DEFAULT: cssVarColor("--destructive"),
          foreground: cssVarColor("--destructive-foreground"),
        },
        muted: {
          DEFAULT: cssVarColor("--muted"),
          foreground: cssVarColor("--muted-foreground"),
        },
        accent: {
          DEFAULT: cssVarColor("--accent"),
          foreground: cssVarColor("--accent-foreground"),
        },
        popover: {
          DEFAULT: cssVarColor("--popover"),
          foreground: cssVarColor("--popover-foreground"),
        },
        card: {
          DEFAULT: cssVarColor("--card"),
          foreground: cssVarColor("--card-foreground"),
        },
        sidebar: {
          DEFAULT: cssVarColor("--sidebar"),
          foreground: cssVarColor("--sidebar-foreground"),
          primary: cssVarColor("--sidebar-primary"),
          "primary-foreground": cssVarColor("--sidebar-primary-foreground"),
          accent: cssVarColor("--sidebar-accent"),
          "accent-foreground": cssVarColor("--sidebar-accent-foreground"),
          border: cssVarColor("--sidebar-border"),
          ring: cssVarColor("--sidebar-ring"),
        },
        chart: {
          1: cssVarColor("--chart-1"),
          2: cssVarColor("--chart-2"),
          3: cssVarColor("--chart-3"),
          4: cssVarColor("--chart-4"),
          5: cssVarColor("--chart-5"),
        },
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
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        heading: ["var(--font-heading)", ...defaultTheme.fontFamily.sans],
      },
      /* P3.1 Semantic type scale — codex design system.
         Prefer these over arbitrary `text-[Npx]` so typography stays consistent
         across feature pages and dark mode swaps cleanly. */
      fontSize: {
        "codex-hero": ["56px", { lineHeight: "1.07", letterSpacing: "-0.022em", fontWeight: "600" }],
        "codex-display": ["40px", { lineHeight: "1.10", letterSpacing: "-0.018em", fontWeight: "600" }],
        "codex-h1": ["32px", { lineHeight: "1.15", letterSpacing: "-0.014em", fontWeight: "600" }],
        "codex-h2": ["24px", { lineHeight: "1.25", letterSpacing: "-0.011em", fontWeight: "600" }],
        "codex-h3": ["20px", { lineHeight: "1.30", letterSpacing: "-0.009em", fontWeight: "600" }],
        "codex-lead": ["18px", { lineHeight: "1.45", letterSpacing: "-0.006em", fontWeight: "500" }],
        "codex-body": ["15px", { lineHeight: "1.55", letterSpacing: "-0.003em", fontWeight: "400" }],
        "codex-body-strong": ["15px", { lineHeight: "1.55", letterSpacing: "-0.003em", fontWeight: "600" }],
        "codex-caption": ["13px", { lineHeight: "1.45", letterSpacing: "-0.002em", fontWeight: "400" }],
        "codex-caption-strong": ["13px", { lineHeight: "1.45", letterSpacing: "-0.002em", fontWeight: "600" }],
        "codex-micro": ["11px", { lineHeight: "1.40", letterSpacing: "0", fontWeight: "500" }],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.25s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
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
