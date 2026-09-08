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
      name: "protocol-is-foundational",
      severity: "error",
      from: { path: "^packages/protocol" },
      to: { path: "^apps" },
    },
    {
      name: "web-does-not-import-realtime-authority",
      severity: "error",
      from: { path: "^apps/web" },
      to: { path: "^apps/realtime-worker" },
    },
    {
      name: "realtime-does-not-import-web",
      severity: "error",
      from: { path: "^apps/realtime-worker" },
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
