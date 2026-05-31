/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'SF Mono'", "'Fira Code'", "'JetBrains Mono'", "monospace"],
      },
      colors: {
        shell: "#0c0c0c", // page background
        surface: "#111111", // tab bar
        strip: "#0f0f0f", // session strip / input bg
        border: "#1e1e1e", // default border
        "border-dim": "#161616", // subtle row dividers
        muted: "#555555", // placeholder, column headers, subtle labels
        dim: "#666666", // secondary content (tool call args, timestamps)
        mid: "#777777", // inactive tabs, less-prominent text
        sub: "#888888", // secondary labels ("thiny", session strip)
        agent: "#aaaaaa", // agent response text
        primary: "#cccccc", // main readable text (user input, body)
        bright: "#ffffff", // active tab, logo
        "status-green": "#22c55e", // connected indicator
      },
    },
  },
  plugins: [],
};
