/**
 * A minimal stand-in for Drizzle's fluent query builder, for unit tests
 * that shouldn't need a real Postgres connection. Every chain method is a
 * jest spy that returns the same object (so tests can assert on e.g. what
 * `.set(...)` or `.values(...)` was called with), and the object resolves
 * to `result` when awaited — mirroring how a real query builder is itself
 * a thenable.
 */
export interface ChainableMock {
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  orderBy: jest.Mock;
  values: jest.Mock;
  set: jest.Mock;
  onConflictDoNothing: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  returning: jest.Mock;
  /** The `FOR UPDATE`/`FOR SHARE` row-locking clause. */
  for: jest.Mock;
  then: (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) => Promise<unknown>;
}

// Deliberately returns `ChainableMock`, not `T & ChainableMock`: intersecting
// a non-object `T` (e.g. `undefined`, as most `.update()`/`.insert()` mocks
// use) with an object type collapses to `never`. Awaiting the object still
// resolves to `T` at the call site — that's carried by `then`'s own type
// parameter below, independent of the object's declared shape.
export function chainable<T>(result: T): ChainableMock {
  const obj = {} as ChainableMock;
  const chainMethodNames: (keyof Omit<ChainableMock, 'then'>)[] = [
    'from',
    'where',
    'limit',
    'innerJoin',
    'leftJoin',
    'orderBy',
    'values',
    'set',
    'onConflictDoNothing',
    'onConflictDoUpdate',
    'returning',
    'for',
  ];

  for (const name of chainMethodNames) {
    obj[name] = jest.fn(() => obj);
  }

  obj.then = ((resolve: (value: T) => void, reject?: (reason?: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject)) as ChainableMock['then'];

  return obj;
}
