import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tailwindcss from "eslint-plugin-tailwindcss";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

// Resolve the Tailwind v4 CSS entry relative to this config file so the
// eslint-plugin-tailwindcss `cssConfigPath` is correct regardless of which
// package the linted file lives in (the plugin otherwise resolves relative
// to each file's nearest package.json directory).
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

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
    files: ["scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node }
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
    // Rules of hooks apply wherever hooks are written, and many of this
    // codebase's hooks live in plain `.ts` files — `useShellState`,
    // `useDocumentViews`, `useWorkspaceLifecycle`, `usePanelResize`. Scoping
    // this to `.tsx` meant a conditional hook call or a missing dependency in
    // any of them linted clean.
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    // Fast-refresh boundaries are a component-module concern, so this stays
    // scoped to the files that can export components.
    files: ["**/*.tsx"],
    plugins: {
      "react-refresh": reactRefresh
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { "allowConstantExport": true }
      ]
    }
  },
  {
    // Tailwind CSS class-conflict detection — mirrors the `cssConflict`
    // warnings shown by the Tailwind IntelliSense extension, but runnable
    // from `pnpm lint` / `scripts/qa.sh`. Scoped to the packages that
    // actually emit Tailwind classes; `cssConfigPath` points at the v4
    // entry that defines the `@theme inline` token mapping. Kept as `warn`
    // during the initial cleanup pass; bump to `error` once clean.
    // See docs/reviews or AGENTS.md for the promotion checklist.
    files: [
      "apps/desktop/src/**/*.{ts,tsx}",
      "packages/ui/src/**/*.{ts,tsx}"
    ],
    plugins: { tailwindcss },
    settings: {
      tailwindcss: {
        cssConfigPath: path.resolve(repoRoot, "apps/desktop/src/index.css")
      }
    },
    rules: {
      "tailwindcss/no-contradicting-classname": "warn",
      // Autofixable (🔧): rewrites arbitrary values that have an exact
      // built-in equivalent (e.g. `py-[0.625rem]` → `py-2.5`). Safe to run
      // with `eslint --fix`; the suggested classes are byte-equivalent.
      "tailwindcss/no-unnecessary-arbitrary-value": "warn"
    }
  }
);
