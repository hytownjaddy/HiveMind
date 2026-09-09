import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages export TypeScript source; let Next compile them.
  transpilePackages: ["@hivemind/schema", "@hivemind/core"],
  // Serve images as-is so the Worker never depends on a runtime image optimizer.
  images: { unoptimized: true },
};

export default nextConfig;

// Makes `getCloudflareContext()` (D1, secrets, vars) work inside `next dev`
// by starting a local miniflare from wrangler.jsonc.
void initOpenNextCloudflareForDev();
