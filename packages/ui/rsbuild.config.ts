import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4318',
      '/v1': 'http://localhost:4318',
      '/health': 'http://localhost:4318',
    },
  },
  html: {
    title: 'agent-lens',
  },
  source: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
