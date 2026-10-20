import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** GitHub Pages serves 404.html for unknown paths, so deep links keep working. */
function githubPagesSpaFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      const dist = resolve('dist');
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [react(), githubPagesSpaFallback()],
  server: {
    host: '0.0.0.0',
    port: 43123,
    strictPort: true,
  },
});
