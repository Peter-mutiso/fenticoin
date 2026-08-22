import { randomUUID } from 'node:crypto';

import '@testing-library/jest-dom';

// jsdom's `crypto` global doesn't implement `randomUUID` (unlike every real
// browser) — polyfilled here purely for the test environment so code that
// calls `crypto.randomUUID()` (e.g. generating an idempotency key) doesn't
// need a test-only branch of its own.
if (typeof window.crypto.randomUUID !== 'function') {
  Object.defineProperty(window.crypto, 'randomUUID', { value: randomUUID, configurable: true });
}

// `next/navigation`'s App Router hooks require a real router context that
// plain `@testing-library/react` `render()` doesn't provide. Every test
// gets a minimal, overridable default so components using `usePathname`/
// `useRouter`/`useSearchParams` (nav links, redirects) don't throw —
// individual tests can still `jest.mock('next/navigation', ...)` with
// more specific behavior when the navigation itself is under test.
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));
