// Integration tests need PostgreSQL: `docker compose up -d db` or `npm run db:local`.
// Uses TEST_DATABASE_URL, default: the local db on port 54329, database "shani_test" (wiped on every run).
import type { TestProject } from 'vitest/node';
import { resetDatabase } from '../src/db/ensure';

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://shani:shani@localhost:54329/shani_test';
  try {
    await resetDatabase(url);
  } catch (e) {
    throw new Error(
      `Cannot reach the test database (${url}).\nStart PostgreSQL first: "docker compose up -d db" or "npm run db:local", or set TEST_DATABASE_URL.\n${String(e)}`,
    );
  }
  project.provide('dbUrl', url);
}
