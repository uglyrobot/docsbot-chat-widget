/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/components/**/*.{js,jsx}",
    "./node_modules/streamdown/dist/**/*.{js,cjs,mjs}",
  ],
  darkMode: ["class"],
  theme: {
    extend: {},
  },
  plugins: [],
}
