import path from 'node:path';

export const E2E = {
  port: 3101,
  baseURL: 'http://localhost:3101',
  adminEmail: 'admin@e2e.test',
  adminPassword: 'e2e-admin-password-123',
  /** test-only authenticator secret (base32) */
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  outbox: path.resolve(import.meta.dirname, '.tmp/outbox'),
  backupCodesFile: path.resolve(import.meta.dirname, '.tmp/backup-codes.json'),
  authFile: path.resolve(import.meta.dirname, '.auth/admin.json'),
  fixtures: path.resolve(import.meta.dirname, 'fixtures'),
};
