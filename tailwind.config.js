/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
    // Include streamdown if it has class names we need
    "./node_modules/streamdown/**/*.{js,jsx,ts,tsx,html}" 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
