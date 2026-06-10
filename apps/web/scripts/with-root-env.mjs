import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const command = process.argv.slice(2).join(' ').trim();
if (!command) {
  console.error('No command provided.');
  process.exit(1);
}

const rootEnvPath = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: false });
} else if (!process.env.VERCEL && !process.env.CI) {
  console.warn(
    `[with-root-env] No root .env at ${rootEnvPath} and not on Vercel/CI — relying on shell env.`,
  );
}

if (command.includes('next build')) {
  process.env.NODE_ENV = 'production';
}

const isBuild = command.includes('next build');
const isPrismaTask = /prisma\s+(generate|migrate|db|studio)/.test(command);
if (isBuild || isPrismaTask) {
  const required = ['DATABASE_URL'];
  if (isBuild && process.env.NODE_ENV === 'production') {
    required.push('JWT_SECRET');
  }
  const missing = required.filter((key) => !process.env[key] || process.env[key].trim() === '');
  if (missing.length > 0) {
    console.error(
      `[with-root-env] Missing required env vars for "${command}": ${missing.join(', ')}.\n` +
        `Set them in the root .env, your shell, or Vercel/CI env config.`,
    );
    process.exit(1);
  }
}

const child = spawn(command, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
