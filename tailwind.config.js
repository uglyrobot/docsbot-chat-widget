/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,jsx}",
    "./node_modules/streamdown/dist/**/*.{js,cjs,mjs}",
  ],
  darkMode: ["class"],
  theme: {
    extend: {},
  },
  plugins: [],
}
