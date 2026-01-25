const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#2563eb",
        secondary: "#14b8a6",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        neutral: "#64748b",
        surface: "#ffffff",
        muted: "#f1f5f9",
        ink: "#0f172a",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        card: "0 10px 30px -18px rgba(15, 23, 42, 0.25)",
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};
