import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react(), tailwind()],
  vite: {
    ssr: {
      noExternal: ['@coinbase/cdp-react', '@coinbase/cdp-core', '@coinbase/cdp-hooks'],
    },
  },
});
