# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is openant

Self-hosted platform that generates SEO articles from topics, publishes to a Ghost blog, and promotes on social media (Pinterest/Threads via Make.com). One-command install, visual setup wizard, zero coding required.

## Common commands

All wizard commands run from `wizard/` directory:

```bash
# Development (hot-reload wizard + Docker infra)
docker compose -f docker-compose.dev.yml up -d
cd wizard && npm install && npm run dev

# Full local dev install (copies to /tmp/openant-dev, builds everything)
bash install-dev.sh

# Unit tests
cd wizard && npm test                    # run all
cd wizard && npx vitest run src/lib/__tests__/state.test.ts  # run single file
cd wizard && npm run test:watch          # watch mode
cd wizard && npm run test:coverage       # with coverage

# Integration tests (requires Docker services running)
cd wizard && npm run test:integration

# Static analysis (CI runs this)
cd wizard && npm run check               # typecheck + lint + format:check
cd wizard && npm run typecheck           # tsc --noEmit only
cd wizard && npm run lint                # eslint only
cd wizard && npm run format:check        # prettier check only
cd wizard && npm run format              # auto-format

# Production build
cd wizard && npm run build

# Docker
docker compose up -d                     # production (7 services)
docker compose logs -f                   # view logs
docker compose down                      # stop
docker compose down -v                   # stop + delete data
```

## Architecture overview

The `wizard/` directory is the **only custom code**. Everything else (Ghost, NocoDB, n8n, Caddy, PostgreSQL, MySQL) runs as unmodified Docker images.

**7 Docker services** on a shared bridge network (`openant_net`):
- **wizard** (Next.js, port 3000) — setup wizard + dashboard + API
- **ghost** (Ghost 5) — blog engine
- **ghost-db** (MySQL 8.0) — Ghost database
- **nocodb** (NocoDB 0.260.0, port 8080) — spreadsheet UI / topic queue
- **db** (PostgreSQL 16) — NocoDB database
- **n8n** (n8n 2.9.2, port 5678) — workflow automation
- **caddy** (Caddy 2, ports 80/443) — reverse proxy with auto-HTTPS

### Instance modes

- **BYOK** — user provides their own LLM API key; wizard collects it during setup
- **Managed** — LLM credentials injected via cloud-init env vars from SaaS control plane; n8n is managed remotely

`process.env.INSTANCE_MODE` (`byok` | `managed`) determines which path is taken during deploy.

### Adapter system (core pattern)

Each external service has a TypeScript adapter in `wizard/src/lib/adapters/`. This is the central architectural pattern.

| Interface | Implementation | File |
|-----------|---------------|------|
| `BlogAdapter` | Ghost | `adapters/ghost.ts` |
| `TableAdapter` | NocoDB | `adapters/nocodb.ts` |
| `AutomationAdapter` | n8n | `adapters/n8n.ts` |
| Contracts | — | `adapters/types.ts` |

**Adapter rules:**
- One file = one adapter. Factory function, not class.
- Adapters are stateless — config comes from env vars read at call time (not module load).
- Adapters don't know about each other.
- Use Docker-internal URLs (`http://ghost:2368`), not public ones.
- Each adapter has a "fast path" that checks existing credentials before full setup.
- Env vars are persisted to `.env` immediately after each successful setup step.

### Key lib modules (beyond adapters)

- `domain.ts` — domain resolution: `getServiceDomains()` (SaaS flat subdomains), `getCustomDomains()` (user custom domains), `isSaasMode()`
- `credentials.ts` — deterministic service credential generation (SHA256 of token+service)
- `docker.ts` — Docker service management, `startServices()`, `restartServices()`, `reloadCaddy()` via Admin API with docker exec fallback
- `caddy.ts` — Caddyfile generation. `generateCaddyfile(services, mode, domain, customDomains?)` — 4th param is optional custom domain map
- `sse.ts` — Server-Sent Events stream helpers for the deploy pipeline
- `config.ts` — `.env` file read/write (`readEnv()`, `writeEnv()`)
- `state.ts` — `state.json` read/write for setup wizard state

### API routes

**Setup routes** (`/api/setup/*`): welcome, domain, llm, blog, social, status, apply

**Dashboard routes** (`/api/dashboard/*`): status, stats, reconfigure

**SaaS integration** (`/api/saas/*`): health, articles, prompts — called by SaaS control plane proxy

**Other**: `/api/health`, `/api/make-blueprint`

### State lifecycle

- **During setup:** `state.json` is the source of truth (read/write via `src/lib/state.ts`)
- **After deploy:** `.env` file is the source of truth (read/write via `src/lib/config.ts`)
- Deploy pipeline reads full `state.json` and distributes to services

### Deploy pipeline

`POST /api/setup/apply` — 12-step SSE pipeline, fully idempotent. Each adapter has fast paths for re-deploy. Supports `?startFrom=N` for retry from failed step.

### Wizard steps

Each step = UI component (`app/setup/steps/`) + API route (`app/api/setup/`) + Zod schema.

Steps: Welcome → Domain → LLM → Blog → Social (optional) → Review → Deploy.

### API conventions

- Routes compose `withAuth(apiHandler(async (req) => { ... }))`
- Auth: `Authorization: Bearer <SETUP_TOKEN>` via `withAuth()` middleware (`src/lib/auth.ts`)
- Error handling: `apiHandler()` catches ZodError→400, AdapterError→500, unknown→500
- Response format: `{ success: true, data?: ... }` or `{ success: false, error, code? }`
- Validation: Zod v4 schemas inline next to API routes

## Code conventions

- **TypeScript strict**: `strict: true`, no `any`, no `as` assertions
- **Files**: kebab-case (`llm-presets.ts`), PascalCase for React components (`Welcome.tsx`)
- **Imports**: `@/*` path alias, no deep relative imports
- **Async/await**: No `.then()` chains
- **Prettier**: semicolons, single quotes, trailing commas, 100 char width, 2-space indent
- **Zod v4**: `z.record(z.string(), valueSchema)` not v3 syntax; `error.issues` not `error.errors`
- **ESLint**: `no-explicit-any: error`, `no-unused-vars: error` (except `_` prefix)
- **i18n**: All UI strings via `useTranslations()` hook from `src/lib/i18n.ts` — no hardcoded strings
- **Testing**: Vitest + Testing Library, mock adapters in `adapters/__mocks__/`

## Tech stack

Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui, Zod v4, Vitest, Docker Compose, Caddy 2.
