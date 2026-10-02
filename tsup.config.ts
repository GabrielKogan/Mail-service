import { defineConfig } from 'tsup';

// esbuild resuelve el alias `@/` con los `paths` de tsconfig.json. Las dependencias
// de package.json quedan externas y se cargan desde node_modules.
export default defineConfig({
  entry: { worker: 'worker/index.ts' },
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  tsconfig: 'tsconfig.json',
});
