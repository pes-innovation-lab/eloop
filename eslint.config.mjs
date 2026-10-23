import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    // Keep effect-state performance advice visible without requiring a UI rewrite.
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      ".cloudflare/**",
      ".wrangler/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
