import type { FastifyBaseLogger } from 'fastify';
import type { AppContext } from './server';
import { getSettings } from './services/catalog';

/**
 * Privacy housekeeping: delete customer photos past their retention period and abandoned checkouts.
 * Runs every 6 hours – inside the API process (PURGE_TIMER=true, default) or as a Kubernetes CronJob (cli/purge.ts).
 */
export async function purgeOnce({ db, orders }: Pick<AppContext, 'db' | 'orders'>, log: FastifyBaseLogger) {
  const s = await getSettings(db);
  const r = await orders.purgePhotos(s.photoRetentionDays);
  if (r.photos) log.info(r, 'deleted old customer photos');
  return r;
}
