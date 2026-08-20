import type { drizzle } from 'drizzle-orm/postgres-js';

import type * as schema from './schema';

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;
