import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

const config = tseslint.config(
  {
    ignores: ["eslint.config.mjs", "src/managed/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    rules: {
      "@typescript-eslint/no-redeclare": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
  },
);

export default config;