import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  {
    ignores: ["build/**", "node_modules/**", "output/**", "artifacts/**"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
];
