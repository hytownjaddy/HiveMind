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
    {
      name: "core-is-framework-free",
      severity: "error",
      comment: "packages/core is shared by the web app and the session Worker (D-031).",
      from: { path: "^packages/core" },
      to: { path: "^apps" },
    },
    {
      name: "compiler-is-node-only",
      severity: "error",
      comment: "The content compiler uses node:fs and remark; Workers never bundle it.",
      from: { path: "^apps" },
      to: { path: "^packages/core/src/content/compiler" },
    },
    {
      name: "route-handlers-are-thin",
      severity: "error",
      comment:
        "Route handlers only reach packages/core through lib/server (D-031, acceptance 7); no components, client code, or repositories.",
      from: { path: "^apps/web/app/api/.*route\\.ts$" },
      to: { path: "^apps/web/(components|lib/session|app/\\(app\\))|^packages/core" },
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
