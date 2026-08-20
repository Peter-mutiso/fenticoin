/**
 * Integration test config — real Postgres via testcontainers, so it needs
 * Docker available on the machine running it. Run with:
 *   pnpm --filter @fenticoin/api test:integration
 * These are NOT part of the default `pnpm test` run (see jest.config.js).
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testTimeout: 60_000,
};
