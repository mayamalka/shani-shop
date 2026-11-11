import argon2 from 'argon2';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { randomBytes } from 'node:crypto';
import type { DB } from '../db';
import { adminSessions, adminUsers, backupCodes, pendingLogins, type AdminUser } from '../db/schema';
import { randomToken, sha256, type Secrets } from '../lib/crypto';
import { HttpError } from '../lib/http';

export const SESSION_HOURS = 8;
const PENDING_MINUTES = 5;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

authenticator.options = { window: 1, step: 30 };

const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (pw: string) => argon2.hash(pw, ARGON);
// used to spend the same time when the email doesn't exist (no user enumeration by timing)
let dummyHash: Promise<string> | null = null;

export function generateBackupCodes(n = 10): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => {
    const raw = Array.from(randomBytes(10), (x) => alphabet[x % alphabet.length]).join('');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
const normalizeBackup = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hashBackupCode = (c: string) => sha256('backup:' + normalizeBackup(c));

const invalid = () => new HttpError(401, 'INVALID_CREDENTIALS', 'אימייל או סיסמה שגויים');
const lockedError = (until: Date) =>
  new HttpError(423, 'LOCKED', `החשבון נעול זמנית בגלל ניסיונות כושלים. נסי שוב בעוד ${Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000))} דקות.`);

export class AuthService {
  constructor(
    private db: DB,
    private secrets: Secrets,
  ) {}

  private async registerFailure(admin: AdminUser) {
    const failed = admin.failedAttempts + 1;
    await this.db
      .update(adminUsers)
      .set(failed >= MAX_FAILED ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedAttempts: failed })
      .where(eq(adminUsers.id, admin.id));
  }

  /** Step 1: password. Returns a short-lived token for step 2. */
  async login(email: string, password: string): Promise<string> {
    const [admin] = await this.db.select().from(adminUsers).where(eq(adminUsers.email, email));
    if (!admin) {
      dummyHash ??= hashPassword(randomToken());
      await argon2.verify(await dummyHash, password).catch(() => false);
      throw invalid();
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) throw lockedError(admin.lockedUntil);
    const ok = await argon2.verify(admin.passwordHash, password).catch(() => false);
    if (!ok) {
      await this.registerFailure(admin);
      throw invalid();
    }
    const token = randomToken();
    await this.db.delete(pendingLogins).where(or(eq(pendingLogins.adminId, admin.id), lt(pendingLogins.expiresAt, new Date())));
    await this.db.insert(pendingLogins).values({ adminId: admin.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + PENDING_MINUTES * 60_000) });
    return token;
  }

  /** Step 2: authenticator code or a one-time backup code. Returns a new session. */
  async verifySecondFactor(pendingToken: string | undefined, input: { code?: string; backupCode?: string }) {
    const expired = new HttpError(401, 'LOGIN_EXPIRED', 'פג תוקף הכניסה – יש להתחיל מחדש עם הסיסמה');
    if (!pendingToken) throw expired;
    const pending = await this.db.query.pendingLogins.findFirst({ where: (p, { eq: e }) => e(p.tokenHash, sha256(pendingToken)), with: { admin: true } });
    if (!pending || pending.expiresAt < new Date()) throw expired;
    const admin = pending.admin;
    if (admin.lockedUntil && admin.lockedUntil > new Date()) throw lockedError(admin.lockedUntil);

    let ok = false;
    let step: number | null = null;
    if (input.code) {
      const delta = authenticator.checkDelta(input.code, this.secrets.decrypt(admin.totpSecretEnc));
      if (delta !== null) {
        step = Math.floor(Date.now() / 30_000) + delta;
        ok = step > admin.lastTotpStep; // a code can be used only once
      }
    } else if (input.backupCode) {
      const used = await this.db
        .update(backupCodes)
        .set({ usedAt: new Date() })
        .where(and(eq(backupCodes.adminId, admin.id), eq(backupCodes.codeHash, hashBackupCode(input.backupCode)), isNull(backupCodes.usedAt)))
        .returning({ id: backupCodes.id });
      ok = used.length === 1;
    }

    if (!ok) {
      await this.registerFailure(admin);
      const attempts = pending.attempts + 1;
      if (attempts >= MAX_FAILED) await this.db.delete(pendingLogins).where(eq(pendingLogins.id, pending.id));
      else await this.db.update(pendingLogins).set({ attempts }).where(eq(pendingLogins.id, pending.id));
      throw new HttpError(401, 'INVALID_CODE', 'הקוד שגוי או שפג תוקפו');
    }

    await this.db.delete(pendingLogins).where(eq(pendingLogins.id, pending.id));
    await this.db
      .update(adminUsers)
      .set({ failedAttempts: 0, lockedUntil: null, ...(step !== null ? { lastTotpStep: step } : {}) })
      .where(eq(adminUsers.id, admin.id));
    return this.createSession(admin.id);
  }

  async createSession(adminId: string) {
    const token = randomToken();
    const csrfToken = randomToken(16);
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
    await this.db.delete(adminSessions).where(and(eq(adminSessions.adminId, adminId), lt(adminSessions.expiresAt, new Date())));
    await this.db.insert(adminSessions).values({ adminId, tokenHash: sha256(token), csrfToken, expiresAt });
    return { token, csrfToken, expiresAt };
  }

  async getSession(token: string | undefined) {
    if (!token) return null;
    const s = await this.db.query.adminSessions.findFirst({
      where: (x, { eq: e }) => e(x.tokenHash, sha256(token)),
      with: { admin: { columns: { id: true, email: true } } },
    });
    if (!s || s.expiresAt < new Date()) return null;
    return s;
  }

  async logout(token: string | undefined) {
    if (token) await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, sha256(token)));
  }
}

/** Creates (or resets) an admin. Returns the TOTP setup URI and the backup codes to show once. */
export async function provisionAdmin(db: DB, secrets: Secrets, opts: { email: string; password: string; totpSecret?: string }) {
  const secret = opts.totpSecret ?? authenticator.generateSecret(20);
  const codes = generateBackupCodes();
  const data = {
    passwordHash: await hashPassword(opts.password),
    totpSecretEnc: secrets.encrypt(secret),
    lastTotpStep: 0,
    failedAttempts: 0,
    lockedUntil: null,
  };
  await db.transaction(async (tx) => {
    const [admin] = await tx
      .insert(adminUsers)
      .values({ email: opts.email, ...data })
      .onConflictDoUpdate({ target: adminUsers.email, set: data })
      .returning({ id: adminUsers.id });
    await tx.delete(backupCodes).where(eq(backupCodes.adminId, admin!.id));
    await tx.delete(adminSessions).where(eq(adminSessions.adminId, admin!.id));
    await tx.insert(backupCodes).values(codes.map((c) => ({ adminId: admin!.id, codeHash: hashBackupCode(c) })));
  });
  return { otpauthUrl: authenticator.keyuri(opts.email, 'הדודה שני – ניהול', secret), secret, backupCodes: codes };
}
