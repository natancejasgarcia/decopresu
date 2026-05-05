import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./actions/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1f2a2b",
        muted: "#66736f",
        paper: "#f6f7f4",
        line: "#d9e0db",
        moss: "#225c50",
        clay: "#9a5a2e",
        steel: "#335f82",
      },
      boxShadow: {
        soft: "0 14px 35px rgba(31, 42, 43, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
