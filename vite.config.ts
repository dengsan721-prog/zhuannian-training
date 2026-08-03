import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    exclude: [
      ...configDefaults.exclude,
      '**/.superpowers/**',
      '**/.tmp/**',
      '**/tmp/**',
    ],
    setupFiles: './src/test/setup.ts',
  },
});
