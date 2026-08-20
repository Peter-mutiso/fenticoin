# Real-Money Directional Trading Platform — Technical Specification

Status: **Architecture/spec only — no application code written yet**, per instruction.

## 0. Investigation summary (what's verified vs. assumed)

Before writing this spec, `fenticoin.com` was investigated directly.

**What was verified:**
- The domain resolves and serves a page titled "FentiCoin - Trusted Cryptocurrency Trading Platform."
- The site is a JavaScript-rendered SPA; the available fetch tooling could not render it, so no layout, color, typography, navigation, or screen-level detail could be observed. No screenshot file was actually attached to this conversation despite being referenced.
- Multiple independent scam-tracking services (ScamAdviser, ScamDoc, Scam Detector, GridinSoft, howtofix.guide) consistently flag fenticoin.com as high-risk: very low trust scores, blacklist hits, no verifiable licensed operator, "guaranteed return" marketing, and user reports of deposits that could not be withdrawn.

**Decision (confirmed with you):** because the reference site's actual UI can't be observed and the site itself isn't a trustworthy design reference, this spec bases UX/IA patterns on the well-documented, generic conventions of short-term directional trading / prediction-market apps (ticker + live chart, countdown-based contract entry, up/down ticket, portfolio, markets list) rather than on any fenticoin.com-specific claim. Every UI-related statement below is a **design recommendation**, not a verified fact about a specific site. Nothing here is copied from any proprietary source — this is original architecture built around your stated functional requirements.

---

## Requirements you didn't mention

These materially affect the architecture and should be resolved early, ideally before Phase 4 (see §U):

1. **Regulatory classification & licensing.** Depending on jurisdiction, "Rise/Fall / Higher/Lower / Up/Down" contracts may be classified as gambling, as financial derivatives (binary options), or be outright restricted for retail (e.g. banned for retail in the EU/UK, tightly regulated by the CFTC in the US). You need legal counsel to determine target jurisdictions and required licenses *before* real money flows. This gates Phase 7 below.
2. **Jurisdiction/geo-fencing.** Server-side IP + declared-address blocking of restricted jurisdictions, enforced continuously (not just at signup), since users travel and rules change.
3. **AML/CTF program**, not just KYC identity checks: sanctions/PEP screening, transaction monitoring rules, suspicious-activity reporting workflow, tiered deposit/withdrawal limits by verification level.
4. **Segregation of customer funds.** Most gambling/financial licenses require user balances to be provably backed by funds held separately from operating capital — this shapes the ledger design in §F.
5. **Responsible-gambling controls as legal requirements, not just admin features**: mandatory deposit limits, self-exclusion (with a minimum enforced duration you can't self-reverse), reality checks/session time reminders, and cross-checking against any jurisdiction-mandated self-exclusion registries.
6. **Price/settlement oracle integrity.** Where do entry/exit prices actually come from? This is the single most dispute-prone part of the product and isn't specified yet — see §G.
7. **Terms of Service, Risk Disclosure, and Privacy Policy** as first-class, versioned, must-accept-to-trade documents (with an audit trail of which version a user accepted and when).
8. **Data privacy compliance** (GDPR/CCPA/etc.) depending on target markets — affects data retention, right-to-erasure vs. audit-log immutability tension (resolve via anonymization, not deletion, of ledger/audit rows).
9. **PCI DSS scope avoidance** — never handle raw card data; always tokenize via the payment provider's hosted fields/SDK.
10. **Disaster recovery targets** (RPO/RTO), backup strategy and restore drills for the ledger database specifically.
11. **Customer support & dispute-resolution workflow**, including chargeback handling if card payments are used.
12. **Accessibility (WCAG 2.1 AA)** — reasonable baseline for a public financial product.
13. **Kill-switch / feature flags** per market and platform-wide, so a single instrument or the whole platform can be halted instantly during a price-feed or settlement incident.

---

## A. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Frontend (public + app) | Next.js (App Router) + TypeScript | SSR for marketing/SEO, CSR for the trading app; plain Next.js self-hosts later with `next start` in a container — no lock-in. |
| Admin console | Separate Next.js app | Hard security boundary — own subdomain, own session cookie, own deploy pipeline. |
| Styling/components | Tailwind CSS + Radix/shadcn primitives | Accessible headless components, fast to theme, no proprietary runtime. |
| Backend | NestJS (Node/TypeScript), containerized | Modular monolith with clean module boundaries; runs as a normal long-lived process — required for WebSockets and locked cron/settlement work that serverless functions handle poorly. |
| Database | PostgreSQL | ACID transactions and row locking are non-negotiable for a ledger. Use a standard-Postgres provider (e.g. Neon) so migration to self-hosted Postgres is a `pg_dump`/logical-replication exercise, not a rewrite. |
| Cache/pub-sub | Redis (e.g. Upstash, portable to self-hosted Redis) | Rate limiting, WS fan-out across instances, short-lived caches. |
| Job/settlement queue | Postgres-backed queue (e.g. `graphile-worker`) using `SELECT ... FOR UPDATE SKIP LOCKED` | Keeps settlement scheduling transactionally consistent with the ledger DB instead of a second system of record. |
| ORM | Drizzle (or Prisma) | Explicit SQL-adjacent migrations; avoid magic that hides transaction/locking behavior. |
| Auth | Custom, backed by Postgres + Argon2id, Google OIDC, Twilio Verify for phone/OTP | Financial platform shouldn't fully outsource identity to a black-box SaaS; provider pieces (SMS, OAuth) are still delegated and swappable. |
| KYC | Third-party vendor (Sumsub/Persona/Onfido — client to select) behind an internal interface | Reduces PII custody burden; swappable. |
| Payments | Provider-agnostic `PaymentProvider` interface; concrete adapter chosen by client later | You explicitly said the provider is TBD — the architecture must not assume one. |
| Realtime | WebSocket gateway in the NestJS backend, Redis pub/sub for multi-instance fan-out | Live prices, odds, bet/balance updates. |
| Monorepo tooling | Turborepo + pnpm workspaces | Shared types/domain logic between web, admin, and api. |
| IaC | Terraform | Portable across hosting providers. |
| Observability | OpenTelemetry + Sentry + Prometheus/Grafana | Not tied to Vercel-only analytics. |
| CI/CD | GitHub Actions | Lint/typecheck/test on PR; deploy on merge. |

**Key decision:** the frontend goes on Vercel; the backend (API, WebSocket gateway, settlement workers) runs as a Docker container on a portable host (Fly.io/Railway/Render to start) from day one, *not* as Vercel serverless functions. Serverless functions can't hold WebSocket connections and don't offer reliable distributed locking for exactly-once settlement. This is the single decision that makes "initially Vercel, later my own server" actually work: the money-critical backend already runs the same containerized way everywhere, so migration is an infra change, not a rewrite. Money math never touches floating point anywhere in the stack — see §F.

---

## B. Frontend architecture

- Monorepo apps: `apps/web` (public marketing + authenticated trading app), `apps/admin` (admin console, separate deploy).
- Route groups in `apps/web`: `(marketing)` public, `(app)` authenticated — trading dashboard, markets, portfolio, wallet, history, profile/KYC, settings.
- Mobile-first Tailwind breakpoints; the trading ticket (asset chart + up/down/higher-lower controls + countdown + stake input) is designed mobile-first since directional micro-trading is a thumb-driven, single-screen interaction pattern — desktop adds a persistent markets sidebar and multi-panel layout.
- Server state via TanStack Query against a documented REST/OpenAPI backend (OpenAPI chosen over tRPC so the API stays consumable by a future native mobile app or third-party integration, not just this frontend).
- Realtime state (live price ticks, odds, open-position status) via a WebSocket client feeding a Zustand store.
- **Balance is never client-computed.** The UI may show optimistic state (e.g. "bet placed, confirming...") but the number that matters always comes from a server push/response; any mismatch reconciles to the server value, never the reverse.
- Shared `packages/ui` design system, `packages/types` generated from the backend's OpenAPI spec, `packages/domain` for shared pure logic (e.g. formatting a `Money` value) usable by both frontend and backend without duplicating rules.
- PWA manifest for an app-like mobile experience without requiring a native app on day one.

## C. Backend architecture

NestJS modular monolith — not microservices; premature at this stage, and a monolith with clean module boundaries can have hot modules (settlement, price feed) extracted later without a rewrite, which matters given the Vercel→own-server migration goal.

Modules: `auth`, `users`, `kyc`, `wallet`, `markets`, `pricing`, `betting`, `settlement`, `payments`, `notifications`, `admin`, `audit`, `risk`, `referrals`, `bonuses`.

Each module is layered (hexagonal/ports-and-adapters):
- **Controllers** (HTTP + WebSocket gateways) — thin, no business logic.
- **Application services** — use-case orchestration, transaction boundaries.
- **Domain layer** — pure functions/value objects (bet payout math, ledger invariants, `Money`), zero framework or DB dependency, so the money-critical logic is trivially unit-testable and portable.
- **Infrastructure** — Postgres repositories, Redis clients, external provider adapters (payments, KYC, SMS).

## D. Database architecture

PostgreSQL is the single source of truth. Core entities (conceptual):

`users`, `kyc_records`, `sessions`/`refresh_tokens`, `roles`/`permissions`, `wallets` (per user, per currency), **`ledger_entries`** (immutable, append-only, double-entry), `wallet_balances` (materialized cache, only ever written inside the same transaction as the ledger entries that justify it), `markets`, `instruments`, `price_ticks`, `bets`, `settlements`, `transactions` (deposits/withdrawals with provider references), `payment_provider_events` (webhook idempotency store), `admin_actions` / `audit_log` (insert-only), `notifications`, `referrals`, `bonuses`, `responsible_gambling_limits`, `risk_flags`.

**Ledger design:** every balance change is expressed as ≥2 `ledger_entries` (debit/credit) that sum to zero within one DB transaction — e.g. debit a "pending bets" liability account, credit the payout on settlement. The current balance is always *derivable* by summing entries; the cached `wallet_balances` row exists only for read performance and is verified by a periodic reconciliation job that recomputes from the ledger and alerts on any drift (which should always be zero — drift means a bug, and this is the safety net that catches it).

**Concurrency:** wallet-affecting operations lock the wallet row (`SELECT ... FOR UPDATE`) inside a transaction to prevent race conditions (e.g. two simultaneous bet placements over-spending a balance).

**Idempotency:** every mutating financial endpoint requires an `Idempotency-Key`; the server stores `(key, request hash, response)` so retries can't double-process. Settlement is additionally idempotent via a unique constraint on `settlements.bet_id`.

**Money type:** stored as `bigint` minor units + an explicit currency/decimals column — never `float`/`double`. Application code only manipulates a `Money` value object; no raw arithmetic on numbers that represent currency.

## E. Authentication architecture

- Passwords hashed with Argon2id.
- Session model: short-lived JWT access token + rotating refresh token in an httpOnly/secure/sameSite cookie; refresh tokens stored hashed with device/session metadata so a user or admin can revoke individual sessions.
- Google sign-in via standard OIDC.
- Phone/OTP via a provider (e.g. Twilio Verify) behind an interface, so it's swappable.
- 2FA: TOTP (RFC 6238) as the primary method with backup codes; SMS OTP as a lower-assurance secondary option. **Mandatory, not optional, for all admin accounts.**
- Password reset: signed, single-use, short-lived token to a verified email, invalidates all existing sessions.
- Age/eligibility: DOB captured at signup and re-enforced at KYC; jurisdiction gating enforced server-side on every session (not just at signup) against a configurable blocklist, since regulations and user location both change over time.

## F. Wallet/ledger architecture

The user-facing "wallet" is an internal custodial ledger balance, not a live blockchain address — even if the eventual payment provider is crypto-native, on-chain deposits are watched via provider webhooks and only converted into an internal ledger credit after N confirmations. This keeps bet placement/settlement fast and payment-provider-agnostic.

Ledger accounts are typed (user liability accounts vs. house/operational asset accounts) so total user liabilities are always reconcilable against funds actually held with the payment provider — the technical basis for the "segregated funds" requirement noted above. This is the ledger's actual job: proving, at any time, that displayed balances are backed by real money — the opposite of the "arbitrary dashboard number" pattern flagged in the fenticoin.com scam reports.

## G. Betting engine architecture

All three modes share one settlement pipeline; they differ in contract parameters:

- **Rise/Fall** and **Up/Down**: user picks a direction relative to the price at contract entry; settles at a fixed expiry against the exit price. *Assumption:* treated as the same underlying contract type under different labels, since no verified functional distinction could be confirmed from the reference site — flagged as an open question for you/the client to resolve before final copy/UX naming is locked.
- **Higher/Lower**: user predicts whether the price will be above or below a specific strike/target price (not necessarily the entry price) at expiry — one extra parameter (strike) versus Rise/Fall.

Shared pipeline:
1. Market must be open and the instrument tradable (admin kill-switch checked).
2. Entry price is resolved **server-side** from a defined price oracle at the server's timestamp — the client never supplies a price.
3. Stake is validated and reserved via ledger entries (debit available balance into a "pending bets" account) in one transaction; bet row created `OPEN` with an idempotency key.
4. At expiry, a settlement worker (never the client) resolves the exit price from the same oracle and computes the outcome via a pure domain function.
5. Settlement transitions the bet to `WON`/`LOST`/`PUSH` and posts ledger entries, idempotently, in one transaction.

**Open requirement — price oracle**: not specified yet. This is the most dispute-prone part of the product. It needs a defined, licensable market-data source, with every tick logged (source + timestamp) so a settlement can be audited and disputed transparently. Do not build this on an unlicensed/scraped feed for a real-money product.

**Odds/payout**: admin-configurable payout percentage per market/mode/duration; each bet snapshots the payout rate active at placement time so a later admin change never retroactively affects open bets. A risk module can pause a market or adjust payout dynamically against admin-configured exposure limits (per market/user/time window).

## H. Settlement architecture

A scheduler must guarantee **exactly-once** settlement across process restarts and multiple backend instances: use the Postgres-backed job queue with `SELECT ... FOR UPDATE SKIP LOCKED` so two instances can never settle the same bet. The job selects all bets past expiry and still `OPEN`, locks each, computes the outcome, writes ledger entries, updates status — then publishes a WebSocket event so the user sees the result live. A separate, continuous reconciliation job recomputes every wallet balance from the ledger and alerts on drift.

## I. Payment abstraction architecture

A `PaymentProvider` interface (`createDeposit`, `handleWebhook`, `createWithdrawal`, `getStatus`) with a concrete adapter chosen later — ledger and business logic never call a provider SDK directly. Webhooks are signature-verified and stored in an idempotency table keyed by provider event ID before processing, so retries can't double-credit. **Deposits credit the ledger only after the provider confirms funds are settled/irreversible** — balances are never optimistically inflated before money has actually arrived; this is precisely the anti-pattern the scam reports describe, and this architecture rules it out structurally. Withdrawals above a configurable threshold require explicit admin review before funds leave (fraud/AML control).

## J. Admin architecture

A separate app/subdomain with its own session scope, mandatory 2FA, and optional IP allowlisting. All admin mutations go through the same backend API as everything else (never direct DB access), so every action is uniformly audited and permission-checked. Covers every domain you listed: users, KYC, deposits, withdrawals, wallets, transactions, bets, settlements, markets, instruments, odds, payout rules, risk, bonuses, referrals, notifications, site config, responsible-gambling controls, reports, analytics, audit logs, restrictions, and manual adjustments.

**Manual balance adjustment** is a first-class ledger operation, not a raw `UPDATE` — it requires a reason code, is itself an `admin_actions` row, and above a configurable amount requires a second admin's approval (maker-checker) before the ledger entries commit.

## K. Authorization / RBAC model

Roles (e.g. `support_agent`, `kyc_reviewer`, `finance_admin`, `risk_admin`, `super_admin`) map to granular permissions (`wallet:adjust`, `kyc:approve`, `market:pause`, `user:restrict`, ...), checked server-side by a guard/policy layer on every admin endpoint. High-risk permissions require maker-checker. Admin JWTs carry identity only — permissions are looked up fresh per request so revocation is instant, and the frontend's displayed role is never trusted as an authorization source.

## L. KYC architecture

Third-party vendor behind an interface (mirrors the payment abstraction). Store only the vendor's verification result/reference and minimal PII, preferring vendor-hosted document storage to reduce your own PII liability. State machine: `unverified → pending → approved/rejected → periodic or risk-triggered re-verification`. Deposit/withdrawal limits gated by KYC tier — exact tiers/thresholds are a compliance decision, flagged as pending legal sign-off, not something to hardcode from assumption.

## M. Audit logging

An insert-only `audit_log` (the app's DB role has no `UPDATE`/`DELETE` grant on it) capturing actor, action, before/after diff for sensitive changes, target entity, IP/user-agent, timestamp, and request ID — for both admin actions and sensitive user actions (login, password/2FA change, withdrawal request). Ideally also mirrored to an external append-only sink (log aggregator or object storage with object-lock) so a compromised application can't erase its own trail.

## N. Notification architecture

A channel-agnostic dispatcher (email, SMS, push, in-app) driven by domain events (bet settled, deposit confirmed, withdrawal processed, KYC status change, new-device login) via a transactional outbox pattern — the event row is written in the same DB transaction as the state change it describes, then a worker publishes it, guaranteeing at-least-once delivery even if the process crashes between commit and publish.

## O. Real-time architecture

A WebSocket gateway on the backend pushes live price ticks, odds/payout updates, and bet/balance status changes; auth via a short-lived WS token issued after normal login. Redis pub/sub fans messages out across backend instances. This is the piece most incompatible with pure Vercel serverless functions, which is why the backend runs as a persistent container from day one (§A/§C) rather than as Vercel Functions.

## P. Security model

- Every balance-changing endpoint is server-authoritative: clients send an amount-requested, never a resulting balance or fee-adjusted amount.
- Schema validation (e.g. Zod) at every input boundary.
- Secrets live in environment variables/secret managers on the backend host; only public, non-sensitive config ships to the frontend bundle.
- Rate limiting (Redis token bucket) on auth, OTP, and bet-placement endpoints.
- CSRF protection and secure/httpOnly/sameSite cookies for session auth.
- Least-privilege DB roles; the audit log specifically cannot be altered or deleted by the application role.
- TLS everywhere, provider-managed encryption at rest, field-level encryption for any KYC identifiers not fully offloaded to the KYC vendor.
- Dependency and secret scanning in CI.
- A penetration test is an explicit go-live gate before real funds are handled — not optional.
- Fraud signals: deposit/bet velocity checks, device fingerprinting, multi-accounting detection.

## Q. Testing strategy

- Unit tests on the domain layer (money math, payout calculation, ledger invariants) at the highest coverage bar in the codebase.
- Property-based tests asserting ledger invariants (every transaction's entries sum to zero; derived balance always equals the cached balance).
- Integration tests against real Postgres (testcontainers), including concurrency tests that simulate simultaneous bet placement to prove no double-spend.
- Contract tests for payment/KYC adapters against provider sandboxes.
- E2E tests (Playwright) for critical journeys: signup → KYC → deposit → place bet → settlement → withdrawal, and the admin maker-checker flow.
- Load/soak testing on the settlement path (a burst of simultaneous expiries) before go-live.
- Chaos testing: kill the backend mid-settlement and verify idempotent resume with no double payout.

## R. Deployment strategy (initial — Vercel)

- `apps/web` and `apps/admin` deploy to Vercel as two projects (or one project, two route groups — separate is cleaner given admin's harder auth boundary).
- `apps/api` (NestJS + WS + workers) deploys as a Docker container to a portable host (Fly.io/Railway/Render) — never as Vercel serverless functions, per §A/§C/§O.
- Managed Postgres (e.g. Neon — standard Postgres, portable) and managed Redis (e.g. Upstash).
- GitHub Actions CI: lint/typecheck/test on every PR, Vercel preview deploys for frontend PRs, staging deploy for the backend container on merge to main, manual promotion to production.

## S. Migration strategy: Vercel → own server

Because the backend was containerized from day one, migration is infrastructure work, not a rewrite: run the same Docker image on your own server behind your own reverse proxy/TLS (e.g. Caddy or nginx), stand up Postgres/Redis on your own infra (or keep the managed versions and move them on an independent schedule), and cut over via `pg_dump`/restore or logical replication for minimal downtime. Point DNS at the new backend. The frontend can either keep deploying to Vercel indefinitely or self-host via `next start` in a container — these two migrations are independent, and the backend one matters more since that's where the money logic and the pieces genuinely incompatible with serverless (WebSockets, locked settlement cron) live. This works cleanly *only* because no Vercel-only primitives (Vercel KV, Edge Config, Vercel Cron) were used in the backend anywhere — that constraint should be enforced in code review, not just assumed.

## T. Folder structure

```
/apps
  /web        Next.js — public site + authenticated trading app
  /admin      Next.js — admin console (separate deploy/subdomain)
  /api        NestJS — REST + WebSocket + workers/scheduler
/packages
  /ui         shared design system components
  /types      shared DTOs, OpenAPI-generated client types
  /domain     Money value object, ledger/payout pure logic — no framework deps
  /config     shared eslint/tsconfig/tailwind config
/infra        Terraform, Dockerfiles, CI workflows
/docs         this spec, ADRs, runbooks
```

Within `apps/api/src/modules/{auth,users,kyc,wallet,markets,pricing,betting,settlement,payments,notifications,admin,audit,risk,referrals,bonuses}`, each module follows the controller → application-service → domain → infrastructure layering from §C.

---

## U. Recommended implementation phases

0. **Foundations** — monorepo scaffold, CI, environments, ADR log; get the open compliance questions (§ "Requirements you didn't mention" items 1–7) in front of legal/counsel early, since they constrain later phases.
1. **Identity & ledger skeleton** — auth (email/password first), users/wallets/ledger schema, double-entry engine with concurrency tests, admin skeleton with RBAC, audit log plumbing. No real money; everything behind a sandbox flag.
2. **Markets & betting engine, demo mode** — price feed (real or simulated), all three contract types, bet placement/settlement against play-money balances, live WebSocket updates, full test suite.
3. **Payments, sandbox mode** — chosen provider's test mode, deposit/withdrawal flows, webhook idempotency, admin review queue — still no real funds.
4. **KYC & compliance** — KYC vendor integration, tiered limits, self-exclusion/deposit-limit/cooling-off controls, jurisdiction gating, versioned terms/risk-disclosure acceptance.
5. **Admin completeness & risk management** — remaining admin domains (bonuses, referrals, notifications, site config, reporting/analytics), maker-checker enforcement, per-market exposure limits.
6. **Security hardening & external audit** — penetration test, load/chaos testing of settlement, dependency/secret audits, and a legal/regulatory go/no-go review — an explicit gate before real money.
7. **Real-money pilot** — live payment mode for a restricted cohort/jurisdiction with low limits, close reconciliation monitoring, gradual rollout.
8. **Own-server migration** — execute §S once traffic, cost, or control requirements justify it.

Stopping here per your instruction — no application code has been written.
