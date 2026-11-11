import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import type { Config } from '../config';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

/** Development: writes each email to .outbox/ as JSON + HTML (open the .html in a browser). */
export class FileEmail implements EmailProvider {
  constructor(
    private dir: string,
    private from: string,
  ) {}
  async send(msg: EmailMessage) {
    await mkdir(this.dir, { recursive: true });
    const base = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 7)}`;
    await writeFile(path.join(this.dir, base + '.json'), JSON.stringify({ from: this.from, ...msg }, null, 2));
    await writeFile(path.join(this.dir, base + '.html'), msg.html);
  }
}

export class SmtpEmail implements EmailProvider {
  private transport;
  constructor(
    cfg: Config,
    private from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_PORT === 465,
      auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
    });
  }
  async send(msg: EmailMessage) {
    await this.transport.sendMail({ from: this.from, ...msg });
  }
}

export function createEmail(cfg: Config): EmailProvider {
  return cfg.EMAIL_TRANSPORT === 'smtp' ? new SmtpEmail(cfg, cfg.EMAIL_FROM) : new FileEmail(cfg.EMAIL_OUTBOX, cfg.EMAIL_FROM);
}

// ---------------- templates (Hebrew, RTL) ----------------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="margin:0;background:#FFF8EC;font-family:Arial,sans-serif;color:#5A3A22;direction:rtl">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="background:#fff;border:2px dashed #F3D9A8;border-radius:18px;padding:24px">
<h1 style="color:#B5541E;font-size:22px;margin:0 0 12px">${esc(title)}</h1>
${bodyHtml}
</div>
<p style="font-size:12px;color:#7A5A40;text-align:center;margin-top:16px">הדודה שני · ספרי לבד בעבודת יד</p>
</div></body></html>`;
}

export const p = (s: string) => `<p style="margin:0 0 10px;line-height:1.6">${esc(s)}</p>`;
export const table = (rows: [string, string][]) =>
  `<table style="width:100%;border-collapse:collapse;margin:10px 0">${rows
    .map(([a, b]) => `<tr><td style="padding:6px 0;border-bottom:1px dashed #F3D9A8">${esc(a)}</td><td style="padding:6px 0;border-bottom:1px dashed #F3D9A8;text-align:left">${esc(b)}</td></tr>`)
    .join('')}</table>`;
export { esc };
