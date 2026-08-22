import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone vanilla-JS Chrome extension package — not part of the Next.js/TS toolchain
    // this config targets (see apps/extension/README.md for how it's built/loaded).
    "apps/extension/**",
    // Claude Code skill tooling (CommonJS scripts run standalone by the harness, not bundled
    // into the app) — not part of the Next.js/TS toolchain this config targets.
    ".claude/**",
  ]),
]);

export default eslintConfig;
