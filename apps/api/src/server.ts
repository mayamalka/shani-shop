import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { loadConfig, REPO_ROOT, type Config } from './config';
import { createDb, type DB } from './db';
import { Secrets } from './lib/crypto';
import { createEmail, type EmailProvider } from './lib/email';
import { HttpError } from './lib/http';
import { MAX_UPLOAD_BYTES } from './lib/images';
import { MockPaymentProvider, type PaymentProvider } from './lib/payments';
import { LocalStorage, type StorageProvider } from './lib/storage';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { paymentRoutes } from './routes/payments';
import { publicRoutes } from './routes/public';
import { AuthService } from './services/auth';
import { Notifier } from './services/notifications';
import { OrderService } from './services/orders';

export interface AppContext {
  cfg: Config;
  db: DB;
  storage: StorageProvider;
  email: EmailProvider;
  payments: PaymentProvider;
  secrets: Secrets;
  auth: AuthService;
  orders: OrderService;
  notifier: Notifier;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

export interface BuildOptions {
  config?: Config;
  /** pass an existing db (tests); otherwise a pool is created from DATABASE_URL */
  db?: DB;
  email?: EmailProvider;
  logger?: boolean;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const cfg = opts.config ?? loadConfig();
  const app = Fastify({
    logger: opts.logger ?? cfg.NODE_ENV !== 'test',
    trustProxy: cfg.NODE_ENV === 'production',
    bodyLimit: 1024 * 1024,
  });

  let db = opts.db;
  if (!db) {
    const created = createDb(cfg.DATABASE_URL);
    db = created.db;
    app.addHook('onClose', () => created.pool.end());
  }
  const secrets = new Secrets(cfg.APP_SECRET);
  const storage = new LocalStorage(cfg.UPLOAD_DIR);
  const email = opts.email ?? createEmail(cfg);
  const payments = new MockPaymentProvider(cfg.API_URL, secrets);
  const notifier = new Notifier(db, email, app.log, cfg.WEB_URL);
  const ctx: AppContext = {
    cfg, db, storage, email, payments, secrets, notifier,
    auth: new AuthService(db, secrets),
    orders: new OrderService(db, storage, notifier),
  };
  app.decorate('ctx', ctx);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://analytics.tiktok.com'],
        connectSrc: ["'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com', 'https://www.facebook.com', 'https://*.tiktok.com', 'https://*.tiktokw.us'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://www.facebook.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com', 'https://*.tiktok.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        frameSrc: ["'self'", 'https://www.facebook.com'],
        formAction: ["'self'", cfg.API_URL, cfg.WEB_URL],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: cfg.COOKIE_SECURE ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    // "no-referrer" (helmet's default) makes browsers send "Origin: null" on form posts, which our origin check rejects
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: cfg.COOKIE_SECURE,
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });
  if (!cfg.RATE_LIMIT_DISABLED) {
    await app.register(rateLimit, {
      global: false,
      errorResponseBuilder: () => ({ statusCode: 429, error: 'RATE_LIMITED', message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' }),
    });
  }

  // Block cross-site POSTs: browsers always send Origin on these; it must be our own site.
  const allowedOrigins = new Set([new URL(cfg.WEB_URL).origin, new URL(cfg.API_URL).origin]);
  app.addHook('onRequest', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (req.url.startsWith('/api/payments/webhook/')) return; // server-to-server, signature-checked
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) throw new HttpError(403, 'BAD_ORIGIN', 'בקשה ממקור לא מורשה');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message, details: err.details });
    if (err instanceof ZodError) return reply.status(400).send({ error: 'VALIDATION', message: err.issues[0]?.message ?? 'קלט לא תקין' });
    const e = err as { statusCode?: number; code?: string; message?: string; error?: string };
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') return reply.status(413).send({ error: 'FILE_TOO_LARGE', message: 'הקובץ גדול מדי (עד 10MB)' });
    if (e.statusCode === 429) return reply.status(429).send({ error: 'RATE_LIMITED', message: e.message });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.code ?? 'BAD_REQUEST', message: 'בקשה לא תקינה' });
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: 'SERVER_ERROR', message: 'אירעה תקלה. נסו שוב מאוחר יותר.' });
  });

  // product & page pictures (public). Customer photos live under private/ and are never served here.
  await app.register(fastifyStatic, { root: storage.publicDir(), prefix: '/media/', decorateReply: false, maxAge: '7d', immutable: true });

  await app.register(publicRoutes, { prefix: '/api' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });
  await app.register(authRoutes, { prefix: '/api/admin/auth' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  // Optional: serve the built React app with SPA fallback (any non-API path → index.html).
  const webDist = path.join(REPO_ROOT, 'apps/web/dist');
  if (cfg.SERVE_WEB && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false, decorateReply: true, index: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/media/')) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'לא נמצא' });
      }
      return reply.header('cache-control', 'no-cache').sendFile('index.html', webDist);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'NOT_FOUND', message: 'לא נמצא' }));
  }

  return app;
}
