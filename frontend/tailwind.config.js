const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: token("ink"), muted: token("muted"), line: token("line"), surface: token("surface"),
        accent: token("accent"), gold: token("gold"), success: token("success"),
        warning: token("warning"), danger: token("danger"), focus: token("focus"),
        "gold-soft": token("gold-soft"), "success-soft": token("success-soft"), "warning-soft": token("warning-soft"),
        "danger-soft": token("danger-soft"), "accent-soft": token("accent-soft"),
        slate: { 950: token("surface"), 900: token("surface"), 800: token("line"), 700: token("line"), 500: token("muted"), 400: token("muted"), 300: token("ink"), 200: token("ink"), 100: token("ink") },
        amber: { 950: token("gold-soft"), 900: token("gold-soft"), 800: token("gold"), 700: token("gold"), 600: token("gold"), 500: token("accent"), 400: token("accent"), 300: token("accent"), 200: token("accent"), 100: token("accent") },
        emerald: { 950: token("success-soft"), 900: token("success-soft"), 800: token("success"), 700: token("success"), 600: token("success"), 500: token("success"), 400: token("success"), 300: token("success"), 200: token("success"), 100: token("success") },
        red: { 950: token("danger-soft"), 900: token("danger-soft"), 800: token("danger"), 700: token("danger"), 600: token("danger"), 500: token("danger"), 400: token("danger"), 300: token("danger"), 200: token("danger"), 100: token("danger") },
        indigo: { 950: token("accent-soft"), 900: token("accent-soft"), 800: token("accent"), 700: token("accent"), 600: token("accent"), 500: token("accent"), 400: token("accent"), 300: token("accent"), 200: token("accent"), 100: token("accent") },
        purple: { 950: token("accent-soft"), 900: token("accent-soft"), 800: token("accent"), 700: token("accent"), 600: token("accent"), 500: token("accent"), 400: token("accent"), 300: token("accent"), 200: token("accent"), 100: token("accent") },
        blue: { 950: token("accent-soft"), 900: token("accent-soft"), 800: token("accent"), 700: token("accent"), 600: token("accent"), 500: token("accent"), 400: token("accent"), 300: token("accent"), 200: token("accent"), 100: token("accent") },
        yellow: { 950: token("warning-soft"), 900: token("warning-soft"), 800: token("warning"), 700: token("warning"), 600: token("warning"), 500: token("warning"), 400: token("warning"), 300: token("warning"), 200: token("warning"), 100: token("warning") },
        gray: { 300: token("line"), 400: token("muted"), 500: token("muted"), 900: token("ink") },
        white: token("surface"), black: token("ink"),
      },
      fontFamily: { sans: ["var(--font-ui)"], serif: ["var(--font-display)"] },
      spacing: {
        "grid-1": "var(--space-1)",
        "grid-2": "var(--space-2)",
        "grid-3": "var(--space-3)",
        "grid-4": "var(--space-4)",
        "grid-5": "var(--space-5)",
        "grid-6": "var(--space-6)",
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.5" }],
        base: ["1rem", { lineHeight: "1.6" }],
        lg: ["1.125rem", { lineHeight: "1.5" }],
        xl: ["1.25rem", { lineHeight: "1.4" }],
        "2xl": ["1.5rem", { lineHeight: "1.3" }],
        "3xl": ["1.875rem", { lineHeight: "1.2" }],
        "4xl": ["2.25rem", { lineHeight: "1.15" }],
      },
    },
  },
  plugins: [],
};
