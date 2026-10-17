import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  server: {
    // Chromium's dev profile lives in the project (see src/main/main.ts); never watch it.
    watch: { ignored: ['**/.dev-userdata/**', '**/out/**'] },
  },
});
