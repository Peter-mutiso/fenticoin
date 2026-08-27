# syntax=docker/dockerfile:1

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/domain/package.json packages/domain/
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile


FROM deps AS build

COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm --filter @fenticoin/domain build \
 && pnpm --filter @fenticoin/types build \
 && pnpm --filter @fenticoin/api build


FROM base AS prod-deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/domain/package.json packages/domain/
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

# Install production dependencies for the workspace.
# Do not filter this installation so pnpm creates the workspace links.
RUN pnpm install --frozen-lockfile --prod --shamefully-hoist


FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /repo

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nestjs

# Production dependencies + pnpm workspace links.
# Both copies are needed: --shamefully-hoist places (most) resolved
# packages in the workspace-root node_modules, but @fenticoin/api's own
# node_modules (pnpm creates this for every workspace project regardless
# of hoisting) is the direct, unambiguous resolution path for packages
# @fenticoin/api itself depends on directly — e.g. reflect-metadata,
# imported at the top of src/main.ts and required unconditionally by
# Nest's decorator metadata reflection at boot. Relying on hoisting alone
# has previously caused "Cannot find module 'reflect-metadata'" at
# runtime; do not remove either COPY without re-verifying module
# resolution from /repo/apps/api in a production-like environment.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules

# Workspace package metadata + compiled output
COPY --from=build /repo/packages/config/package.json ./packages/config/package.json
COPY --from=build /repo/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /repo/packages/types/package.json ./packages/types/package.json

COPY --from=build /repo/packages/domain/dist ./packages/domain/dist
COPY --from=build /repo/packages/types/dist ./packages/types/dist

# API
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/drizzle ./apps/api/drizzle

WORKDIR /repo/apps/api

USER nestjs

EXPOSE 4000

CMD ["node", "dist/main.js"]