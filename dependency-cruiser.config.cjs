/* global module */

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "schema-is-foundational",
      severity: "error",
      from: { path: "^packages/schema" },
      to: { path: "^apps" },
    },
    {
      name: "web-does-not-import-session-authority",
      severity: "error",
      from: { path: "^apps/web" },
      to: { path: "^apps/session-worker" },
    },
    {
      name: "session-does-not-import-web",
      severity: "error",
      from: { path: "^apps/session-worker" },
      to: { path: "^apps/web" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: {
      path: "(^|/)(\\.next|\\.open-next|\\.wrangler|coverage|dist)/",
    },
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"],
    },
  },
};
