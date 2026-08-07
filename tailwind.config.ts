import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-base)",
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        error: "var(--error)",
      },
      fontFamily: {
        sans: ["var(--font-inter-tight)", "sans-serif"],
        display: ["var(--font-mono-display)", "monospace"],
      },
      fontSize: {
        xs: ["11px", "1.4"],
        sm: ["13px", "1.5"],
        base: ["15px", "1.6"],
        md: ["17px", "1.5"],
        lg: ["22px", "1.3"],
        xl: ["30px", "1.2"],
        "2xl": ["42px", "1.1"],
        "3xl": ["60px", "1.0"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "20px",
      },
      spacing: {
        18: "72px",
      },
    },
  },
  plugins: [],
} satisfies Config;
