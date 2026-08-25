/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Integration tests need a real Postgres (via testcontainers => Docker)
  // and are run separately with `pnpm test:integration` — see
  // jest.integration.config.js. Excluded here so `pnpm test` stays fast
  // and runnable anywhere, including environments without Docker.
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!main.ts'],
  coverageDirectory: '../coverage',
  moduleFileExtensions: ['js', 'json', 'ts'],
};
