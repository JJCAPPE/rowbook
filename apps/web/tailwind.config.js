const defaultTheme = require("tailwindcss/defaultTheme");
const { heroui } = require("@heroui/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/react/node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    "../../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
    "../../node_modules/@heroui/react/node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "hsl(var(--heroui-foreground) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-display)", ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        card: "0 18px 50px -30px rgba(0, 0, 0, 0.7)",
      },
      borderRadius: {
        xl: "1rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translate3d(0, 12px, 0)" },
          "100%": { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        drift: {
          "0%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(0, -6px, 0)" },
          "100%": { transform: "translate3d(0, 0, 0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s ease-out both",
        "fade-in": "fade-in 0.5s ease-out both",
        drift: "drift 7s ease-in-out infinite",
      },
    },
  },
  plugins: [
    heroui({
      defaultTheme: "light",
      themes: {
        dark: {
          colors: {
            primary: {
              DEFAULT: "#FFFFFF",
              foreground: "#000000",
            },
            focus: "#000000",
          },
        },
        light: {
          colors: {
            primary: {
              DEFAULT: "#000000",
              foreground: "#FFFFFF",
            },
            focus: "#FFFFFF",
          },
        },
      },
    }),
  ],
};
