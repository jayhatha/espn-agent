import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: "chrome",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "ESPN Draft Assistant",
    description: "Real-time draft recommendations for ESPN fantasy baseball",
    permissions: ["storage", "tabs"],
    host_permissions: [
      "https://fantasy.espn.com/*",
      "https://lm-api-reads.fantasy.espn.com/*",
      "http://localhost/*",
      "https://localhost/*",
      "http://127.0.0.1/*",
      "https://127.0.0.1/*",
      "https://*.up.railway.app/*",
    ],
    web_accessible_resources: [
      {
        resources: ["assets/*.json", "assets/*.png", "assets/*.js", "simulation-worker.js", "bid-optimizer-worker.js"],
        matches: ["https://fantasy.espn.com/*"],
      },
    ],
  },
});
