import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults: no incremental cache. Add `incrementalCache` (R2/KV) here when
// pages start using `use cache` / ISR.
export default defineCloudflareConfig({});
