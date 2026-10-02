// @ts-check
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**", ".impeccable/**", "test/fixtures/**"] },
  {
    files: ["**/*.js"],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: {
      ...js.configs.recommended.rules,
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "all" }],
    },
  },
  {
    files: ["bin/**/*.js", "lib/**/*.js", "test/**/*.js", "eslint.config.js"],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: ["client/*.js", "shell/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
    rules: {
      "no-restricted-globals": ["error", "process", "Buffer", "require", "module", "__dirname", "__filename"],
    },
  },
  {
    files: ["shell/*.js"],
    // TypeScript checks shared bindings, including writes from other fragments.
    rules: {
      "no-undef": "off",
      "prefer-const": "off",
      "no-unused-vars": ["error", { vars: "local", argsIgnorePattern: "^_", caughtErrors: "all" }],
    },
  },
  {
    files: ["lib/check.js", "test/e2e/*.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.nodeBuiltin, optionlab: "readonly" } },
  },
];
