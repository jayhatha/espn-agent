import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ESPN Draft Assistant',
    description: 'Real-time draft recommendations for ESPN fantasy baseball',
    permissions: ['storage', 'tabs'],
    host_permissions: ['https://fantasy.espn.com/*'],
    web_accessible_resources: [
      {
        resources: ['assets/*.json', 'assets/*.png'],
        matches: ['https://fantasy.espn.com/*'],
      },
    ],
  },
});
