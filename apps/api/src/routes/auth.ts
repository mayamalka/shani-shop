import { backupCodeSchema, loginSchema, totpSchema } from '@shani/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError, parse } from '../lib/http';
import { SESSION_HOURS } from '../services/auth';

export const SESSION_COOKIE = 'sid';
const PENDING_COOKIE = 'pl';

export const sessionCookieOptions = (secure: boolean) => ({ httpOnly: true, secure, sameSite: 'strict' as const, path: '/api' });

/** Guard for every admin route: valid session + CSRF token on changes. Runs on the server, always. */
export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply) {
  const session = await req.server.ctx.auth.getSession(req.cookies[SESSION_COOKIE]);
  if (!session) throw new HttpError(401, 'UNAUTHENTICATED', 'יש להתחבר מחדש');
  if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== session.csrfToken) {
    throw new HttpError(403, 'CSRF', 'פג תוקף הטופס – רעננו את הדף ונסו שוב');
  }
  req.adminSession = session;
}

declare module 'fastify' {
  interface FastifyRequest {
    adminSession?: Awaited<ReturnType<import('../services/auth').AuthService['getSession']>>;
  }
}

const limit = { rateLimit: { max: 10, timeWindow: 60_000 } };

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { auth, cfg } = app.ctx;
  const secure = cfg.COOKIE_SECURE;

  app.post('/login', { config: limit }, async (req, reply) => {
    const { email, password } = parse(loginSchema, req.body);
    const token = await auth.login(email, password);
    reply.setCookie(PENDING_COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/api/admin/auth', maxAge: 5 * 60 });
    return { step: 'totp' };
  });

  app.post('/verify', { config: limit }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const input = body.backupCode ? parse(backupCodeSchema, body) : parse(totpSchema, body);
    const session = await auth.verifySecondFactor(req.cookies[PENDING_COOKIE], input);
    reply.clearCookie(PENDING_COOKIE, { path: '/api/admin/auth' });
    reply.setCookie(SESSION_COOKIE, session.token, { ...sessionCookieOptions(secure), maxAge: SESSION_HOURS * 3600 });
    return { ok: true, csrfToken: session.csrfToken };
  });

  app.get('/me', async (req) => {
    const s = await auth.getSession(req.cookies[SESSION_COOKIE]);
    if (!s) throw new HttpError(401, 'UNAUTHENTICATED', 'לא מחובר');
    return { email: s.admin.email, csrfToken: s.csrfToken };
  });

  app.post('/logout', async (req, reply) => {
    await auth.logout(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/api' });
    return { ok: true };
  });
};
