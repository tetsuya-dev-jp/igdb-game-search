import tseslint from "typescript-eslint";
import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  { ignores: ["main.js", "node_modules/", "e2e/.vault/"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json" },
    },
  },
  // Node-only tooling (E2E harness, build scripts, jest config): the Obsidian
  // runtime rules do not apply; these files legitimately use process, fs,
  // fetch, and console.
  {
    files: ["e2e/**/*.mjs", "*.mjs", "jest.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/prefer-window-timers": "off",
      "obsidianmd/no-global-this": "off",
      "no-restricted-globals": "off",
      "no-console": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
  // Test doubles must simulate network calls with fetch.
  {
    files: ["test/**/*.ts"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
];
