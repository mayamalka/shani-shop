/**
 * In Kubernetes the HTML is served by nginx (deploy/docker/security-headers.conf), not by the API.
 * This keeps nginx's security headers in sync with what helmet sends from server.ts.
 */
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config';
import { makeApp } from './helpers';

let app: FastifyInstance;
beforeAll(async () => {
  ({ app } = await makeApp());
});
afterAll(() => app.close());

function nginxHeaders(): Record<string, string> {
  const conf = readFileSync(path.join(REPO_ROOT, 'deploy/docker/security-headers.conf'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of conf.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"\s+always;/gm)) out[m[1]!.toLowerCase()] = m[2]!;
  return out;
}

/** CSP as a directive → sources map, minus the parts that legitimately differ */
function csp(value: string) {
  const map = new Map<string, string>();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    // form-action: the API lists its absolute URLs, nginx uses 'self' (same origin in production)
    // upgrade-insecure-requests: only on with COOKIE_SECURE, which tests run without
    if (name && name !== 'form-action' && name !== 'upgrade-insecure-requests') map.set(name, sources.join(' '));
  }
  return Object.fromEntries([...map].sort());
}

describe('nginx security headers (web image)', () => {
  it('match the API (helmet) headers', async () => {
    const api = (await app.inject({ method: 'GET', url: '/api/health' })).headers;
    const web = nginxHeaders();

    expect(csp(web['content-security-policy']!)).toEqual(csp(String(api['content-security-policy'])));
    expect(web['content-security-policy']).toContain("form-action 'self'");
    expect(web['content-security-policy']).toContain('upgrade-insecure-requests');
    expect(web['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');

    for (const name of [
      'cross-origin-opener-policy',
      'cross-origin-resource-policy',
      'origin-agent-cluster',
      'referrer-policy',
      'x-content-type-options',
      'x-dns-prefetch-control',
      'x-download-options',
      'x-frame-options',
      'x-permitted-cross-domain-policies',
      'x-xss-protection',
    ]) {
      expect(web[name], name).toBe(String(api[name]));
    }
  });
});
