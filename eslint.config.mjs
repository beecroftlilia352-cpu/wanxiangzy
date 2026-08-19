// ESLint 9 flat config — replaced `eslint-config-next` (which uses
// @rushstack/eslint-patch and breaks on ESLint 9.39+) with native
// `@typescript-eslint` + react plugins. `eslint-config-next`'s
// `core-web-vitals` and `typescript` extends only contributed a handful
// of rules; we re-declare the ones the project actually relied on
// (`@typescript-eslint/no-explicit-any: warn` + the
// `@next/next/no-assign-module-variable` warning is dropped — it had
// been warn-only since the original config and was never blocking).
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import globals from "globals";

// Custom global set covering Next.js client/edge runtimes where the
// host polyfills Node built-ins. Both `process` and `Buffer` are
// available in browser bundles thanks to Next.js + Webpack.
const NEXT_RUNTIME_GLOBALS = {
  process: "readonly",
  Buffer: "readonly",
};

const TYPESCRIPT_FILES = ["**/*.{ts,tsx,cts,mts}"];
const SCRIPT_FILES = ["scripts/**/*.{js,cjs,mjs}", "*.config.{js,cjs,mjs,ts,mts}"];

export default [
  {
    ignores: [
      ".claude/**",
      ".codex-logs/**",
      ".next/**",
      ".next-dev/**",
      ".next-dev-logs/**",
      ".next-local-logs/**",
      ".ui-check/**",
      "next-env.d.ts",
      "node_modules/**",
      "test-results/**",
      "tmp-*.txt",
      "*.log",
      "*.json",
      "public/**",
      "supabase/**",
    ],
  },
  js.configs.recommended,
  {
    files: TYPESCRIPT_FILES,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      // Browser globals + Next.js runtime polyfills. TS already validates
      // type-level globals (NodeJS, RequestInit, etc.) so we disable
      // `no-undef` for TS files below — ESLint's no-undef for TS is more
      // noise than signal.
      globals: {
        ...globals.browser,
        ...globals.es2024,
        ...NEXT_RUNTIME_GLOBALS,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // TypeScript handles type-level globals better than ESLint's no-undef.
      "no-undef": "off",
      // Empty catch blocks are a common idiom in route handlers.
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Defensive regex escapes and binary-pattern checks are intentional.
      "no-useless-escape": "warn",
      "no-control-regex": "warn",
      "no-constant-binary-expression": "warn",
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      // Overrides — applied LAST so they win over plugin recommended sets.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-expressions": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unescaped-entities": "warn",
    },
  },
  {
    files: SCRIPT_FILES,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "commonjs",
      },
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
  {
    // Top-level config files (sentry, instrumentation) cross the
    // client/server boundary. TypeScript handles type-level globals;
    // we expose both runtime sets for safety.
    files: [
      "sentry.*.config.ts",
      "instrumentation.ts",
      "instrumentation-client.ts",
    ],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
        ...NEXT_RUNTIME_GLOBALS,
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
