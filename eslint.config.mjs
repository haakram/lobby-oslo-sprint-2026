import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "agent/**",
    "viewer/**",
    "temp/**",
    ".venv/**",
    ".superpowers/**",
    // Other agents' worktrees and their build output.
    ".claude/**",
    "node_modules/**",
    "test-results/**",
    "playwright-report/**",
    "public/mediapipe/**",
  ]),
]);
