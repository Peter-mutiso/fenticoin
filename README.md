# FentiCoin Platform

Full technical spec: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

This repository is currently at **Phase 1 — project foundation**. No betting,
payments, wallets, or accounts are implemented yet. See "Status" below for
exactly what exists.

## Structure

```
/apps
  /web        Next.js — public site (foundation placeholder only)
  /api        NestJS — REST API, health checks, DB/config/logging foundation
/packages
  /domain     Money value object + currency types — no floats, ever
  /types      Shared DTOs between web and api
  /config     Shared tsconfig base
/infra        (reserved for Terraform/IaC — not yet populated)
/docs         Architecture spec and future ADRs
```

## Prerequisites

- Node.js >= 20.11 (developed against Node 24)
- pnpm 9 (`corepack enable` or `npm install -g pnpm`)
- Docker, for a local Postgres instance (optional but recommended)

## Getting started

```bash
pnpm install

# start a local Postgres
docker compose up -d postgres

# copy env templates (already done for local dev; see apps/api/.env and
# apps/web/.env.local, both gitignored)
cp .env.example .env   # reference only — apps read their own .env files

# generate + run the initial migration (creates the `users` table)
pnpm --filter @fenticoin/api db:generate
pnpm --filter @fenticoin/api db:migrate

pnpm dev
```

- API: http://localhost:4000 (`/health` liveness, `/health/ready` readiness)
- Web: http://localhost:3000

## Scripts (run from repo root, fan out via Turborepo)

| Command | What it does |
|---|---|
| `pnpm dev` | Run all apps in watch mode |
| `pnpm build` | Production build of every app/package |
| `pnpm lint` | ESLint across the whole workspace |
| `pnpm typecheck` | `tsc --noEmit` across the whole workspace |
| `pnpm test` / `pnpm test:coverage` | Jest across the whole workspace |
| `pnpm format` / `pnpm format:check` | Prettier |

## Environment configuration

Every app validates its environment variables at startup with `zod` and
fails fast with a readable error if something required is missing or
malformed (`apps/api/src/config/env.schema.ts`, `apps/web/src/lib/env.ts`).
See `.env.example` for the full list. **No `.env*` file other than
`.env.example` is committed** — `.gitignore` enforces this.

## Database & migrations

Postgres via [Drizzle ORM](https://orm.drizzle.team/). Schema lives in
`apps/api/src/database/schema/`; migrations are generated from it and
checked into `apps/api/drizzle/`.

```bash
pnpm --filter @fenticoin/api db:generate   # diff schema -> new SQL migration
pnpm --filter @fenticoin/api db:migrate    # apply pending migrations
pnpm --filter @fenticoin/api db:studio     # Drizzle Studio, local schema browser
```

## Deployment targets

This codebase is built to run unmodified in three places (see
`docs/ARCHITECTURE.md` §R/§S for the full reasoning):

1. **Local development** — as above.
2. **Vercel** — `apps/web` deploys there directly (set the project's Root
   Directory to `apps/web`). `apps/api` is **not** deployed to Vercel
   serverless functions — it needs a persistent process for WebSockets and
   locked settlement cron in later phases, so it runs as a container
   (`apps/api/Dockerfile`) on a host such as Fly.io/Railway/Render.
3. **A conventional Linux server later** — both `apps/api/Dockerfile` and
   `apps/web/Dockerfile` build portable, self-contained images with no
   platform-specific dependencies, so the same images run behind your own
   reverse proxy.

## Status

Implemented in this phase: monorepo tooling, strict TypeScript, lint/format,
Jest across every package, Postgres + Drizzle migration system, a `users`
table (identity foundation only — no auth logic yet), NestJS app with
structured logging, global error handling, security headers, CORS, env
validation, and a Next.js app with the same error/security/env foundations
plus a live API-connectivity check on the homepage.

**Not implemented, intentionally:** authentication, KYC, wallets, ledger,
betting engine, payments, admin console, RBAC. See `docs/ARCHITECTURE.md`
§U for the phase sequence.
