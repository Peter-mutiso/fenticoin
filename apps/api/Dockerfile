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

RUN pnpm install --frozen-lockfile --prod --filter @fenticoin/api... --shamefully-hoist
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nestjs

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/packages/domain/dist ./packages/domain/dist
COPY --from=build /repo/packages/types/dist ./packages/types/dist
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/drizzle ./apps/api/drizzle

USER nestjs
WORKDIR /repo/apps/api

EXPOSE 4000

CMD ["node", "dist/main.js"]
