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
        // Both roles resolve to the same family now — General Sans replaced
        // the old Inter Tight (body) + JetBrains Mono (display) pairing.
        // `font-display` is kept as a class name (not removed) so every
        // existing heading usage across the app keeps working unchanged;
        // it just no longer switches families, weight does the contrast.
        sans: ["var(--font-general-sans)", "sans-serif"],
        display: ["var(--font-general-sans)", "sans-serif"],
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
      // House easing curve, used everywhere so every hover/fade/color
      // transition in the app shares one signature feel instead of each
      // component defaulting to its own timing. This becomes Tailwind's
      // DEFAULT, so plain `transition-colors` etc. (181 existing usages)
      // pick it up automatically with no per-component change needed.
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
