import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./stores/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        chrome: "var(--chrome)",
        surface: "var(--surface)",
        text: "var(--text)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        accent: "var(--accent)",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
