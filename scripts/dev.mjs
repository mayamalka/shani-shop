#!/usr/bin/env node
// npm run dev → starts the API (http://localhost:3001) and the website (http://localhost:5173) together.
import { spawn } from 'node:child_process';

const procs = [
  ['api', ['run', 'dev', '-w', '@shani/api'], '\x1b[35m'],
  ['web', ['run', 'dev', '-w', '@shani/web'], '\x1b[36m'],
].map(([name, args, color]) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (d) => {
      for (const line of String(d).split('\n')) if (line.trim()) out.write(prefix + line + '\n');
    });
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on('exit', (code) => {
    console.log(`${prefix}exited (${code})`);
    shutdown(code ?? 0);
  });
  return p;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
console.log('\n  Website: http://localhost:5173   ·   API: http://localhost:3001\n');
