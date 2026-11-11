/**
 * Creates the admin user, or resets their password + authenticator.
 *
 *   npm run create-admin -- --email shani@example.com
 *
 * You'll be asked for a password (min 12 characters). Then scan the QR code with
 * Google Authenticator / Microsoft Authenticator / Authy, and keep the 10 backup codes somewhere safe.
 * Non-interactive (CI/tests): ADMIN_PASSWORD=... [ADMIN_TOTP_SECRET=... only outside production]
 */
import QRCode from 'qrcode';
import { createInterface } from 'node:readline';
import { loadConfig } from '../src/config';
import { createDb, runMigrations } from '../src/db';
import { Secrets } from '../src/lib/crypto';
import { provisionAdmin } from '../src/services/auth';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const rlAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let muted = false;
  rlAny._writeToOutput = (s: string) => {
    if (!muted || s.includes(question)) rlAny.output.write(s);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const cfg = loadConfig();
const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: npm run create-admin -- --email you@example.com');
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD ?? '';
if (!password) {
  password = await askHidden('Password (min 12 characters): ');
  const again = await askHidden('Repeat password: ');
  if (password !== again) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
}
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}
const totpSecret = cfg.NODE_ENV !== 'production' ? process.env.ADMIN_TOTP_SECRET : undefined;

const { db, pool } = createDb(cfg.DATABASE_URL);
try {
  await runMigrations(db);
  const r = await provisionAdmin(db, new Secrets(cfg.APP_SECRET), { email, password, totpSecret });
  if (process.env.ADMIN_QUIET !== '1') {
    console.log(`\n✔ Admin ready: ${email}\n`);
    console.log('1) Scan this QR code with your authenticator app (Google Authenticator / Microsoft Authenticator / Authy):\n');
    console.log(await QRCode.toString(r.otpauthUrl, { type: 'terminal', small: true }));
    console.log(`   Can't scan? Add it manually with this key: ${r.secret}\n`);
    console.log('2) Save these one-time BACKUP CODES somewhere safe (they are shown only now):\n');
    r.backupCodes.forEach((c, i) => console.log(`   ${String(i + 1).padStart(2)}. ${c}`));
    console.log('\nLog in at /admin/login with your email, password and the 6-digit code from the app.\n');
  } else {
    console.log(JSON.stringify({ email, backupCodes: r.backupCodes }));
  }
} finally {
  await pool.end();
}
