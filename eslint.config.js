import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // We deliberately use unknown-shaped API responses in several places
      "@typescript-eslint/no-explicit-any": "warn",
      // Empty catch blocks are intentional fallbacks in the structure builder
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
);
