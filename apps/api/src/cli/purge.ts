/** One purge run, then exit – used by the Kubernetes CronJob (node dist/purge.js). */
import { purgeOnce } from '../jobs';
import { buildApp } from '../server';

const app = await buildApp();
try {
  const r = await purgeOnce(app.ctx, app.log);
  app.log.info(r, 'purge finished');
} finally {
  await app.close();
}
