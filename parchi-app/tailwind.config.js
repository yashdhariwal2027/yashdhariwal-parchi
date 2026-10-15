/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--color-page)",
        surface: "var(--color-surface)",
        alt: "var(--color-alt)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        line: "var(--color-line)",
        brand: {
          DEFAULT: "var(--color-brand)",
          hover: "var(--color-brand-hover)",
          tint: "var(--color-brand-tint)",
        },
        highlight: "var(--color-highlight)",
        danger: {
          DEFAULT: "var(--color-danger)",
          tint: "var(--color-danger-tint)",
        },
        warn: {
          DEFAULT: "var(--color-warn)",
          tint: "var(--color-warn-tint)",
        },
        bubble: "var(--color-bubble)",
        deep: {
          DEFAULT: "var(--color-deep)",
          2: "var(--color-deep-2)",
          line: "var(--color-deep-line)",
        },
        "on-deep": {
          DEFAULT: "var(--color-on-deep)",
          muted: "var(--color-on-deep-muted)",
        },
        mint: "var(--color-mint)",
        paper: "var(--color-paper)",
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      maxWidth: {
        content: "1120px",
      },
      borderRadius: {
        card: "12px",
        control: "8px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(22, 24, 29, 0.05)",
        lift: "0 1px 2px rgba(22, 24, 29, 0.05), 0 8px 24px -12px rgba(22, 24, 29, 0.12)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 200ms ease-out",
        "accordion-up": "accordion-up 200ms ease-out",
      },
    },
  },
  plugins: [],
};
