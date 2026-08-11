import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".agents/**",
      "**/dist/**",
      "**/node_modules/**",
      "apps/desktop/src-tauri/target/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    // Example extensions are pre-bundled ES modules that run in the webview.
    files: ["examples/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser }
    }
  },
  {
    // `packages/core` is platform-agnostic: it runs wherever its consumers do,
    // so it must not reach for Node. That used to be enforced by accident —
    // the package simply had no Node types — until a test needed to read a file
    // from disk. Saying it out loud keeps the guarantee without keeping the
    // tests untyped. Tests are exempt: they run only under vitest.
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "os", "child_process"],
              message:
                "packages/core is platform-agnostic. Keep host APIs in apps/desktop."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { "allowConstantExport": true }
      ]
    }
  }
);
