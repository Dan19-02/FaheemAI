// Flat ESLint config: typescript-eslint recommended over the backend sources.
// tsc (npm run typecheck) stays the type authority; lint catches the rest.
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    rules: {
      // The data layer and route handlers deliberately pass `any` rows/bodies
      // around (pg rows, req.body); tightening those is tracked work, not a
      // CI blocker, so this stays a visible warning instead of an error.
      "@typescript-eslint/no-explicit-any": "warn",
      // Intentionally-unused catch bindings and underscore-prefixed args are
      // an accepted convention in this codebase.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "data/", "corpus/", "corpus-source/"],
  }
);
