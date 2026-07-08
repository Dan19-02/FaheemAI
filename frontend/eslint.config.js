// Flat ESLint config: typescript-eslint recommended plus the React runtime
// guards (hooks rules + fast-refresh export hygiene) over the app sources.
// tsc (npm run typecheck) stays the type authority; lint catches the rest.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      // react-hooks v7 ships React-Compiler diagnostics at error level; they
      // flag long-standing intentional patterns here (state hydration inside
      // effects, ref reads in imperative wiring). Rewriting those is a
      // behavior-risking refactor, so they stay visible as warnings while the
      // classic rules-of-hooks remains an error.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      // Context modules deliberately export a provider plus its use* hook from
      // one file; splitting them buys nothing but churn, so warn only.
      "react-refresh/only-export-components": "warn",
      // api.ts and the chat plumbing deliberately carry `any` payload shapes;
      // tightening them is tracked work, not a CI blocker, so this stays a
      // visible warning instead of an error.
      "@typescript-eslint/no-explicit-any": "warn",
      // Underscore-prefixed args and ignored catch bindings are an accepted
      // convention in this codebase.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "public/", "assets/"],
  }
);
