import { defineConfig } from 'tsup';

// Production bundle with the shared package inlined. All files land flat in dist/ (paths in config.ts rely on it):
//   dist/index.js         – the API server
//   dist/migrate.js       – apply migrations and exit (Kubernetes migrate Job)
//   dist/purge.js         – one photo-purge run and exit (Kubernetes CronJob)
//   dist/seed.js          – starter data (first deploy only; never overwrites admin edits)
//   dist/create-admin.js  – create/reset the admin (kubectl exec -it … -- node dist/create-admin.js --email …)
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    migrate: 'src/cli/migrate.ts',
    purge: 'src/cli/purge.ts',
    seed: 'src/db/seed.ts',
    'create-admin': 'scripts/create-admin.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@shani/shared'],
});
