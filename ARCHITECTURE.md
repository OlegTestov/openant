# openant — Architecture Overview

> Last updated: 2026-03-04

---

## What is openant

openant is a self-hosted platform for automated content generation and promotion. It orchestrates several services — a blog engine (Ghost), a spreadsheet interface (NocoDB), an automation engine (n8n), and a reverse proxy (Caddy) — through a single Setup Wizard built with Next.js.

The user installs openant on a VPS with one command, walks through a web-based wizard to configure everything, and the system automatically generates SEO articles from a topic queue, publishes them to a blog, and promotes them on social media.

---

## Repository structure

```
openant/
├── docker-compose.yml             # Production: 7 services
├── docker-compose.dev.yml         # Development: infra only (no wizard/caddy)
├── install.sh                     # One-command installer script
├── install-dev.sh                 # Local dev installer (rsync from current dir, /tmp/openant-dev)
├── .env.example                   # All environment variables with defaults
├── .gitignore                     # Root gitignore
├── ARCHITECTURE.md                # This file
├── LICENSE                        # MIT License
│
├── tests/
│   └── e2e/
│       └── run.sh                 # End-to-end test script
│
├── caddy/
│   └── Caddyfile                  # Initial IP-mode reverse proxy config
│
├── n8n/
│   └── workflows/
│       ├── generate-article.template.json   # Article generation workflow
│       └── promote-article.template.json    # Social promotion workflow
│
├── make/
│   └── blueprint.json             # Make.com scenario template (Pinterest)
│
├── ghost/
│   ├── fake-sendmail.sh           # Null mailer for Ghost (avoids SMTP requirement)
│   └── themes/
│       ├── openant-source/        # Forked Source v1.5.0 theme (dark mode toggle)
│       ├── openant-source.zip     # Pre-built theme zip (uploaded during deploy)
│       └── build-theme.sh         # Rebuilds the zip from openant-source/
│
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI pipeline
│
├── docs/                          # Design documentation (specs, plans)
│   ├── SPECIFICATION.md           # Full specification
│   └── plans/
│       ├── stage-01-scaffold.md
│       ├── stage-02-state-auth.md
│       ├── stage-03-wizard-shell.md
│       ├── stage-04-wizard-steps.md
│       ├── stage-05-adapters.md
│       ├── stage-06-deploy-sse.md
│       ├── stage-07-docker-infra.md
│       ├── stage-08-dashboard-saas.md
│       └── stage-10-ci-polish.md
│
├── wizard/                        # Next.js application (the only custom code)
│   ├── Dockerfile                 # Multi-stage build (builder → runner)
│   ├── src/
│   │   ├── app/                   # Next.js App Router (pages + API routes)
│   │   │   ├── page.tsx           # Root redirect (→ /setup or /dashboard)
│   │   │   ├── api/setup/         # Step API routes + deploy endpoint
│   │   │   ├── api/dashboard/     # Dashboard API routes (status, stats, reconfigure)
│   │   │   ├── api/saas/          # SaaS health endpoint (no auth)
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx       # Dashboard page (client component)
│   │   │   └── setup/
│   │   │       ├── page.tsx       # Wizard container (client component)
│   │   │       └── steps/         # Step form components
│   │   ├── components/            # React components (Stepper, StepLayout, ServiceStatus, ui/)
│   │   ├── lib/                   # Business logic, adapters, utilities
│   │   ├── types/                 # Shared TypeScript types
│   │   ├── test/                  # Unit test setup
│   │   └── __tests__/
│   │       └── integration/       # Integration tests (real Docker services)
│   │           ├── setup.ts
│   │           ├── ghost.integration.test.ts
│   │           ├── nocodb.integration.test.ts
│   │           └── n8n.integration.test.ts
│   ├── next.config.ts
│   ├── vitest.config.ts           # Unit test config (jsdom)
│   ├── vitest.integration.config.ts  # Integration test config (node)
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── .prettierrc
│   └── package.json
```

The `wizard/` directory is the only custom code. Everything else (Ghost, NocoDB, n8n, Caddy, PostgreSQL, MySQL) runs as unmodified Docker images configured via docker-compose.

---

## Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 16 (App Router) | Wizard UI + API routes |
| Language | TypeScript (strict mode) | Type safety across the project |
| Validation | Zod v4 | Runtime schema validation for API requests and state |
| Styling | Tailwind CSS v4 + shadcn/ui | UI components |
| Testing | Vitest + Testing Library | Unit and component tests |
| Containers | Docker Compose | 7-service orchestration |
| Reverse proxy | Caddy 2 | Auto-HTTPS, domain routing |
| Linting | ESLint (flat config) | Code quality |
| Formatting | Prettier | Code style |
| Build | `output: "standalone"` | Minimal Docker-ready build |

---

## Docker infrastructure

### Production (`docker-compose.yml`)

7 services orchestrated via docker-compose with a shared bridge network (`openant_net`):

| Service | Image | Container | Purpose |
|---|---|---|---|
| `wizard` | Custom (Dockerfile) | `openant-wizard` | Setup Wizard + API (port 3000) |
| `ghost` | `ghost:5` | `openant-ghost` | Blog engine |
| `ghost-db` | `mysql:8.0` | `openant-ghost-db` | Ghost database |
| `nocodb` | `nocodb/nocodb:0.260.0` | `openant-nocodb` | Spreadsheet UI / topic queue |
| `db` | `postgres:16-alpine` | `openant-db` | NocoDB database |
| `n8n` | `n8nio/n8n:2.9.2` | `openant-n8n` | Workflow automation |
| `caddy` | `caddy:2-alpine` | `openant-caddy` | Reverse proxy with auto-HTTPS |

All services have healthchecks and JSON file logging (`max-size: 10m`, `max-file: 3`).

7 named volumes: `ghost_content`, `ghost_db_data`, `nocodb_data`, `postgres_data`, `n8n_data`, `caddy_data`, `caddy_config`.

### Development (`docker-compose.dev.yml`)

Same infrastructure services but **no wizard** (runs on host via `npm run dev`) and **no caddy** (direct port access). Hardcoded dev passwords. All ports exposed:

- Ghost: `localhost:2368`
- NocoDB: `localhost:8080`
- n8n: `localhost:5678`

Usage: `docker compose -f docker-compose.dev.yml up -d && cd wizard && npm run dev`

### Wizard Dockerfile

Multi-stage build:

1. **Builder stage**: `node:20-alpine`, `npm ci`, `npm run build` → standalone output
2. **Runner stage**: `node:20-alpine`, non-root `nextjs` user, `DOCKER_GID` build arg for Docker socket access, curl for healthcheck

Key environment variables: `STATE_PATH=/app/data/state.json`, `HOSTNAME=0.0.0.0`, `PORT=3000`.

Docker-compose passes additional env vars to the wizard service for SaaS mode:
- `INSTANCE_MODE` — `managed` or `byok` (default: `byok`)
- `GHOST_ADMIN_PASSWORD`, `NOCODB_ADMIN_PASSWORD`, `N8N_ADMIN_PASSWORD` — random passwords injected by cloud-init

### Caddy configuration

**File:** `caddy/Caddyfile`

Initial IP-mode config (`:80 → ghost:2368`). Regenerated by Wizard during deploy:
- **IP mode**: Single `:80` block → Ghost. Blog accessed via Caddy on port 80 (`http://<ip>`), other services use direct ports (NocoDB `:8080`, n8n `:5678`, wizard `:3000`)
- **Domain mode (BYOK)**: 4 server blocks with auto-HTTPS (main→Ghost, table.X→NocoDB, auto.X→n8n, setup.X→wizard)
- **Domain mode (managed)**: 3 server blocks (no auto.X→n8n block)

### Custom Ghost theme (`openant-source`)

**Directory:** `ghost/themes/openant-source/`

A fork of Ghost's default Source theme (v1.5.0) with two modifications:

1. **Dark mode toggle** — the search icon in the header is replaced with a sun/moon toggle button. The toggle sets `data-theme="dark"|"light"` on `<html>` and persists the choice in `localStorage`. On first visit, the system's `prefers-color-scheme` is used as the default. A render-blocking script in `<head>` reads the preference before paint to prevent flash of wrong theme.

2. **Built-in dark mode CSS** — CSS variables are overridden via `html[data-theme="dark"]` selector (instead of the old `@media prefers-color-scheme` injection via `codeinjection_head`). This gives users manual control and persists across page loads.

The theme is pre-built as `ghost/themes/openant-source.zip` and mounted into the wizard container via a Docker volume (`./ghost/themes:/app/themes:ro`). During deploy step 6, the wizard uploads the zip to Ghost via `POST /ghost/api/admin/themes/upload/`. If the theme is already active, the upload is skipped.

To rebuild the zip after modifying theme files: `bash ghost/themes/build-theme.sh`

---

## n8n workflow templates

Two n8n workflow templates live in `n8n/workflows/`. They are imported into n8n during deploy step 11, with placeholder substitution.

### generate-article.template.json

8-node pipeline: Schedule Trigger → Get Next Queued from NocoDB (blank status) → Has Records? → Update status: generating → Generate Article via LLM → Update status: publishing → Publish to Ghost → Update status: published.

### promote-article.template.json

6-node pipeline: Schedule Trigger → Get Published from NocoDB (status=published) → Has Records? → Update status: promoting → Send to Make.com webhook → Update status: completed.

### Placeholder substitution

Templates contain placeholders that the n8n adapter substitutes during import:

| Placeholder | Substitution type | Source |
|---|---|---|
| `{{BLOG_LANGUAGE}}` | String replacement | `WorkflowParams.blogLanguage` |
| `{{BLOG_TONE}}` | String replacement | `WorkflowParams.blogTone` |
| `{{NOCODB_BASE_ID}}` | String replacement | `WorkflowParams.nocodbBaseId` |
| `{{NOCODB_TABLE_ID}}` | String replacement | `WorkflowParams.nocodbTableId` |
| `minutesInterval` | Structured (schedule node) | `WorkflowParams.scheduleIntervalMinutes` |
| `model` | Structured (OpenAI node) | `WorkflowParams.llmModel` |
| `url` (Make node) | Structured (HTTP node named "Make") | `WorkflowParams.makeWebhookUrl` |
| `credentials.*.id` | Structured (all nodes) | `WorkflowParams.credentialIds` |

---

## Adapter system

The core architectural pattern is the **adapter system**. Each external service interacts with the wizard through a TypeScript interface. Replacing a service means writing a new adapter — nothing else changes.

### Four adapter types

| Interface | Responsibility | Current implementation |
|---|---|---|
| `BlogAdapter` | Publish articles, manage blog | Ghost (`src/lib/adapters/ghost.ts`) |
| `TableAdapter` | FIFO topic queue, status tracking | NocoDB (`src/lib/adapters/nocodb.ts`) |
| `AutomationAdapter` | Workflow orchestration | n8n (`src/lib/adapters/n8n.ts`) |
| `DistributionAdapter` | Social media posting | Interface only (→ Make.com) |

### Key files

- **`src/lib/adapters/types.ts`** — All adapter interfaces. This is the central contract that the entire system depends on. Treat as read-only after creation; changes require review since they affect all consumers.
- **`src/lib/adapters/index.ts`** — Registry. `createAdapters()` returns an `Adapters` object with all three adapters. Wired to real implementations (Ghost, NocoDB, n8n).
- **`src/lib/adapters/ghost.ts`** — Ghost BlogAdapter. **Fast path**: if `GHOST_ADMIN_API_KEY` and `GHOST_CONTENT_API_KEY` exist, verifies via JWT against `/ghost/api/admin/site/` and returns immediately (avoids login, which fails with 500 EmailError on re-deploy when mail is not configured). **Full setup**: admin account → extract session cookie from setup response → Custom Integration → settings via session cookie. `uploadTheme()` uploads the custom `openant-source` theme zip via Admin API using session cookie auth (skips if already active). JWT auth via hand-rolled HMAC-SHA256 for publish/get. Internal helpers `requireAdminJwt()`, `assertOk()`, and `getAdminEmail()` deduplicate common operations across methods.
- **`src/lib/adapters/nocodb.ts`** — NocoDB TableAdapter. Multi-step setup (signup → signin → base → table → columns → sample row), removes default bases (e.g. "Getting Started"), FIFO queue via blank-status filter, parallel stats queries.
- **`src/lib/adapters/n8n.ts`** — n8n AutomationAdapter. **Fast path**: if `N8N_API_KEY` exists, verifies against `/api/v1/workflows` and returns immediately. **Full setup**: deterministic password (`N<hex>!` format to satisfy n8n's uppercase+number requirements), create owner → login → list API keys (skips masked keys containing `*`, deletes them) → create fresh key. Credential management, workflow import with parameter substitution, workflow activation.
- **`src/lib/adapters/__mocks__/`** — Mock adapters (`ghost.ts`, `nocodb.ts`, `n8n.ts`). Return deterministic data, no external calls. Used for tests and UI development without Docker.

### Ghost JWT

**File:** `src/lib/adapters/ghost.ts` — `createGhostJwt(adminApiKey)`

Ghost Admin API uses JWT with HMAC-SHA256, where the secret is hex-decoded from the API key. The `adminApiKey` format is `key_id:hex_secret`. The JWT has `kid` in the header and `aud: '/admin/'` in the payload. Implemented with Node.js `crypto` — no external library needed.

### Docker utilities

**File:** `src/lib/docker.ts`

`startServices()` — Waits for Ghost, NocoDB, and n8n to become healthy by polling their healthCheck endpoints. Used during deploy step 3. Throws `AdapterError` if any service is unreachable.

`reloadCaddy()` — Executes `docker exec openant-caddy caddy reload` via `child_process.exec`. Throws `AdapterError` on failure. Used during deploy to apply Caddy configuration changes.

### Caddyfile generator

**File:** `src/lib/caddy.ts`

Generates Caddy reverse proxy configuration based on domain mode:

| Function | Behavior |
|---|---|
| `generateCaddyfile(domains, mode?)` | IP mode (null domains): single `:80` block → Ghost. Domain mode: 3–4 server blocks (main→Ghost, table.X→NocoDB, setup.X→wizard, and auto.X→n8n **only if `mode !== 'managed'`**). In managed mode, n8n block is omitted — n8n is not exposed publicly. |
| `writeCaddyfile(content)` | Writes to `CADDYFILE_PATH` env var (default: `/app/Caddyfile`). |

### SSE streaming

**File:** `src/lib/sse.ts`

Server-Sent Events utility for the deploy pipeline:

| Function | Behavior |
|---|---|
| `createSSEStream()` | Returns `{ stream, controller }` — a ReadableStream and its controller for enqueuing events. |
| `sendSSEEvent(controller, event, data)` | Formats and enqueues an SSE message: `event: X\ndata: JSON\n\n`. |
| `closeSSE(controller)` | Closes the stream. |

### Service credentials

**File:** `src/lib/credentials.ts`

`getServiceCredentials(setupToken, domain?)` — Returns admin credentials for Ghost, NocoDB, and n8n. Passwords are read from environment variables first (`GHOST_ADMIN_PASSWORD`, `NOCODB_ADMIN_PASSWORD`, `N8N_ADMIN_PASSWORD`), with fallback to SHA-256 derivation from `SETUP_TOKEN` for backward compatibility. When provisioned via SaaS, random passwords are injected via cloud-init into the `.env` file and env vars take priority. Admin email defaults to `admin@openant.local` or `admin@{domain}` if a domain is configured.

Each adapter also reads its own env var with the same fallback pattern:
- **Ghost** (`src/lib/adapters/ghost.ts`): `process.env.GHOST_ADMIN_PASSWORD` → SHA-256 fallback
- **NocoDB** (`src/lib/adapters/nocodb.ts`): `process.env.NOCODB_ADMIN_PASSWORD` → SHA-256 fallback
- **n8n** (`src/lib/adapters/n8n.ts`): `process.env.N8N_ADMIN_PASSWORD` → `N<hex>!` fallback

### Environment variable strategy

Adapters read env vars at call time (inside each method), not at module load or adapter creation. This is critical because env vars like `GHOST_ADMIN_API_KEY`, `NOCODB_AUTH_TOKEN` etc. do not exist when `createAdapters()` runs at startup — they are written to `.env` during the deploy step. Base URLs (`GHOST_INTERNAL_URL`, `NOCODB_INTERNAL_URL`, `N8N_INTERNAL_URL`) have sensible Docker-internal defaults.

Each adapter step persists its keys to `.env` immediately after successful setup (not just at finalization). This ensures that if a later step fails, re-deploy can recover via fast paths without repeating earlier steps. Step 1 merges config vars with existing `.env` rather than overwriting, preserving adapter keys from prior runs.

### Adapter rules

1. One file = one adapter. No nested folders or wrapper abstractions.
2. Factory function, not class. `createGhostAdapter()` returns a plain object implementing `BlogAdapter`.
3. Adapters are stateless. Configuration comes from env vars or function parameters.
4. Adapters don't know about each other. Ghost adapter never calls NocoDB adapter.
5. Internal URLs. Adapters use Docker-internal URLs (`http://ghost:2368`), not public ones.

---

## State management

Two storage layers handle configuration at different lifecycle stages:

### state.json — setup-time storage

**File:** `src/lib/state.ts`

During the wizard flow, all configuration is persisted in `state.json`. The `SetupState` type (`src/types/setup.ts`) defines its shape: `currentStep`, `deployed` flag, per-step completion status, and section data (`welcome`, `domain`, `llm`, `blog`, `social`).

| Function | Behavior |
|---|---|
| `readState()` | Reads + validates via zod. Returns `DEFAULT_STATE` if file is missing or corrupted (with `console.warn`). |
| `writeState(state)` | Atomic write: writes to `.tmp` file, then `fs.rename()`. Prevents partial writes on crash. |
| `resetState()` | Writes `DEFAULT_STATE` (all steps `completed: false`, `currentStep: 'welcome'`). |

Path is configurable via `STATE_PATH` env var (default: `/app/data/state.json`). Read at call time via `getStatePath()`, not at module load — this allows tests to override via `vi.stubEnv`.

### .env — runtime storage

**File:** `src/lib/config.ts`

After deploy, the `.env` file becomes the source of truth. The config manager handles reading/writing `.env` files with proper edge-case handling.

| Function | Behavior |
|---|---|
| `parseEnv(content)` | Parses `.env` string: skips `#` comments and empty lines, splits on first `=`, strips surrounding quotes (`"` or `'`), trims key whitespace. |
| `serializeEnv(vars)` | Serializes to `.env` format. Values with spaces are wrapped in double quotes. |
| `readEnv(filePath)` | Reads `.env` from disk. Returns `{}` if file doesn't exist. |
| `writeEnv(filePath, vars)` | Direct write via `fs.writeFile` (no temp+rename — `.env` may be a Docker bind-mounted file). |

### Configuration lifecycle

```
UI Forms → API Route (validate via zod) → state.json (persist) → Deploy → .env + Service APIs
```

- **During setup**: `state.json` is the source of truth.
- **After deploy**: `.env` file is the source of truth.
- Each API route reads/writes only its own section of `state.json`.
- Deploy reads the full `state.json` and distributes data to services.

---

## Authentication

**File:** `src/lib/auth.ts`

All API endpoints (except `/api/health` and `/api/saas/health`) are protected by `SETUP_TOKEN` via the `withAuth()` middleware.

```
Request → withAuth() → check "Authorization: Bearer <token>" → handler or 401
```

- Validates that header starts with `Bearer ` prefix (rejects raw tokens without prefix)
- Compares extracted token against `process.env.SETUP_TOKEN`
- Returns `{ success: false, error: "Unauthorized" }` with status 401 on failure

Usage pattern in API routes:
```ts
export const POST = withAuth(apiHandler(async (req) => { ... }));
```

---

## Error handling

### AdapterError

**File:** `src/lib/errors.ts`

```
AdapterError {
  adapter: string     // 'ghost', 'nocodb', 'n8n'
  operation: string   // 'healthCheck', 'publishPost'
  message: string     // Human-readable description
  cause?: unknown     // Original error
}
```

### API handler wrapper

**File:** `src/lib/api-handler.ts`

`apiHandler()` wraps every API route handler and catches errors at three levels:

| Error type | HTTP status | Response `code` | Details exposed? |
|---|---|---|---|
| `z.ZodError` | 400 | `VALIDATION_ERROR` | First issue message |
| `AdapterError` | 500 | `ADAPTER_ERROR` | Full error message (logged to console) |
| Unknown `Error` | 500 | `INTERNAL_ERROR` | Generic "Internal server error" (no leak) |

**Zod v4 note:** Uses `error.issues[0].message` (not `error.errors[0].message` as in zod v3).

Flow: Adapters throw `AdapterError` → `apiHandler()` catches → formats JSON → UI displays message.

---

## Wizard UI

The wizard is a multi-step form that guides the user through platform configuration. It consists of a Stepper (progress indicator), step content area, and navigation buttons.

### Routing

**File:** `src/app/page.tsx`

The root page is a Server Component that reads `state.json` and redirects:
- `deployed: false` → `/setup` (wizard)
- `deployed: true` → `/dashboard`

### Dashboard

**File:** `src/app/dashboard/page.tsx`

Client component that shows the post-deploy monitoring view:
- **Service health**: Displays health status for Ghost, NocoDB, n8n, and Caddy using `ServiceStatus` components. Status data fetched from `GET /api/dashboard/status`.
- **Article statistics**: Shows counts by status (queue, published, completed, errors) fetched from `GET /api/dashboard/stats`.
- **Quick links**: Direct links to blog, table (NocoDB), and n8n.
- **Auto-refresh**: Polls both APIs every 30 seconds.
- **Reconfigure**: Button with confirm dialog that calls `POST /api/dashboard/reconfigure` to reset deploy state, then redirects to `/setup`.
- **SaaS badge**: Shows "Managed by openant SaaS" badge when `OPENANT_SAAS_MODE=true`.

### Wizard container

**File:** `src/app/setup/page.tsx`

Client component (`'use client'`) that manages wizard state:
- **Token management**: Reads `?token=XXX` from URL on first visit, stores in `localStorage`, uses for all API calls
- **Position restore**: On mount, calls `GET /api/setup/status` to restore `currentStep` and `completedSteps`
- **SaaS mode**: If `saas_mode` flag from `/api/setup/status` is true, filters out the Domain step from `STEPS` and `STEP_COMPONENTS` (domain is managed by Control Plane in SaaS mode)
- **Instance mode**: If `instance_mode` from `/api/setup/status` is `managed`, filters out the LLM step (key is pre-injected via cloud-init)
- **Navigation**: `handleNext()`, `handleBack()`, `handleStepComplete()`, `handleGoToStep()` — all index-based, using filtered step arrays
- **Step rendering**: Maps step index to component via filtered `STEP_COMPONENTS` array

### Step props contract

**File:** `src/types/step-props.ts`

Every step component receives the same props:

```ts
interface StepProps {
  onComplete: (savedData?: Record<string, unknown>) => void;  // Mark step done + advance (optionally pass form data for state persistence)
  onBack?: () => void;           // Go to previous step
  onGoToStep?: (index: number) => void;  // Jump to any step
  initialData?: Record<string, unknown>;  // Pre-fill form from saved config (enables back/forward navigation without losing data)
}
```

### Reusable components

| Component | File | Purpose |
|---|---|---|
| `Stepper` | `src/components/Stepper.tsx` | Horizontal progress indicator with numbered circles, check icons for completed steps, and connector lines. Semantic `<nav>`/`<ol>`/`<li>` with `aria-current="step"`. Responsive: labels hidden on mobile. |
| `StepLayout` | `src/components/StepLayout.tsx` | Step wrapper with title, description, Card container, and i18n-aware Back/Next buttons. Supports `nextLabel`, `nextDisabled`, `isLoading` (spinner + `aria-busy`), `showBack`, `showNext`. |
| `ServiceStatus` | `src/components/ServiceStatus.tsx` | Service health indicator: colored dot (green/red/yellow+pulse) + name + optional "Open →" link. Used in Dashboard and Deploy steps. |

---

## Wizard steps

The wizard is a linear sequence of configuration steps. Each step is a self-contained module with a UI component, an API route, and a Zod schema.

### Step registry

Defined in **`src/lib/steps.ts`** as a `STEPS` array:

| # | ID | Label | Required |
|---|---|---|---|
| 1 | `welcome` | Welcome | Yes |
| 2 | `domain` | Domain | Yes |
| 3 | `llm` | LLM | Yes |
| 4 | `blog` | Blog | Yes |
| 5 | `social` | Social | No |
| 6 | `review` | Review | Yes |
| 7 | `deploy` | Deploy | Yes |

### Step anatomy

Each step consists of three parts:

| Part | File pattern | Responsibility |
|---|---|---|
| UI component | `app/setup/steps/{Name}.tsx` | Form, client validation, UX |
| API route | `app/api/setup/{name}/route.ts` | Server validation via Zod, state persistence |
| Zod schema | Exported from the API route file | Request body typing and validation |

### Common step pattern

All step UI components follow the same pattern:
1. Local form state via `useState`
2. `handleSubmit()` → POST to `/api/setup/{step}` with Bearer token from localStorage
3. On success → `onComplete()` (advances wizard)
4. On error → display error via `<Alert variant="destructive">`
5. Loading state → `isLoading` prop on `StepLayout`

### Step details

| Step | UI component | API route | Key behavior |
|---|---|---|---|
| **Welcome** | Language selector + "Get Started" | `POST /api/setup/welcome` | `z.enum(['en', 'ru'])`. Saves language to localStorage. |
| **Domain** | Switch (domain/IP mode), domain input, DNS result | `POST /api/setup/domain` | `dns.resolve4()` check. Returns `server_ip` + `dns_check`. Domain optional if IP mode. |
| **LLM** | Preset selector, URL/Key/Model inputs, "Test Connection" | `POST /api/setup/llm` | Tests LLM via `POST {api_url}/chat/completions` with 10s timeout. Result returned but doesn't block save. |
| **Blog** | Title, description, language, tone, interval + live preview | `POST /api/setup/blog` | Title max 100 chars, interval min 10 minutes. Client converts hours→minutes. |
| **Social** | Webhook URL, Pinterest/Threads toggles | `POST /api/setup/social` | All fields optional. Empty webhook URL allowed via `z.literal('')`. |
| **Review** | Read-only config cards with Edit buttons | None (reads `/api/setup/status`) | `onGoToStep()` for navigation. API key masked as `•••••`. |
| **Deploy** | Deploy button → SSE progress → success/retry | `POST /api/setup/apply` (SSE) | 12-step pipeline with real-time progress. Retry from failed step. Shows service URLs on success. |

---

## LLM presets

Defined in **`src/lib/llm-presets.ts`**. All LLM providers are OpenAI-compatible, so no adapter is needed — just a preset with `apiUrl` and `defaultModel`:

| Provider | Default model |
|---|---|
| OpenAI | `gpt-4o-mini` |
| OpenRouter | `openai/gpt-4o-mini` |
| DeepSeek | `deepseek-chat` |
| Custom | (user-provided) |

---

## API conventions

- **URL structure**: `/api/health` (no auth), `/api/saas/health` (no auth, SaaS only), `/api/setup/{step}` (auth required), `/api/setup/status` (auth required), `/api/dashboard/*` (auth required)
- **Response format**: `{ success: true, data?: ... }` or `{ success: false, error: string, code?: string }`
- **Auth**: `withAuth()` middleware — `Authorization: Bearer <SETUP_TOKEN>`
- **Error handling**: `apiHandler()` wrapper — catches ZodError (400), AdapterError (500), unknown (500)
- **Validation**: zod v4 schemas defined inline next to the API route
- **Composition**: Routes compose `withAuth(apiHandler(async (req) => { ... }))`

### Current endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | No | Returns `{ status: "ok" }`. Used by Docker healthcheck. |
| `GET /api/setup/status` | Yes | Returns current setup state with masked `api_key` (`***`), `instance_mode`, `saas_mode`, `default_domain`, `server_ip`. |
| `POST /api/setup/welcome` | Yes | Validates language, saves to state, advances to `domain`. |
| `POST /api/setup/domain` | Yes | Validates domain config, runs DNS check if domain mode, advances to `llm`. |
| `POST /api/setup/llm` | Yes | Validates LLM config, tests connection (non-blocking), advances to `blog`. |
| `POST /api/setup/blog` | Yes | Validates blog config (title, language, tone, interval), advances to `social`. |
| `POST /api/setup/social` | Yes | Validates social config (all optional), advances to `review`. |
| `POST /api/setup/apply` | Yes | SSE deploy pipeline. Executes 12 steps, streams progress. Supports `?startFrom=N` for retry. |
| `GET /api/dashboard/status` | Yes | Returns health status for all 4 services (Ghost, NocoDB, n8n, Caddy), service URLs, admin credentials, and `saas_mode` flag. Managed mode: n8n URL and credentials excluded. |
| `GET /api/dashboard/stats` | Yes | Returns article counts by status from NocoDB `table.getStats()`. |
| `POST /api/dashboard/reconfigure` | Yes | Resets `deployed` to false, clears deploy+review steps, sets `currentStep` to review. Preserves all config data. |
| `GET /api/saas/health` | No | Returns 404 if `OPENANT_SAAS_MODE !== 'true'`. Otherwise returns combined health + article stats for Control Plane. |

---

## UI components

10 shadcn/ui components are installed in **`src/components/ui/`**:

`button`, `input`, `select`, `switch`, `card`, `label`, `badge`, `progress`, `alert`, `textarea`

These are copy-pasted components (not a library dependency), styled with Tailwind CSS.

3 custom components in **`src/components/`**:

`Stepper`, `StepLayout`, `ServiceStatus`

---

## Scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `next dev` | Development server |
| `npm run build` | `next build` | Production build (standalone) |
| `npm run start` | `next start` | Start production server |
| `npm run lint` | `eslint` | Lint with strict TypeScript rules |
| `npm run typecheck` | `tsc --noEmit` | Type checking |
| `npm run format` | `prettier --write` | Auto-format source files |
| `npm run format:check` | `prettier --check` | Verify formatting |
| `npm run check` | typecheck + lint + format:check | Full static analysis |
| `npm test` | `vitest run` | Run unit tests (37 files) |
| `npm run test:watch` | `vitest` | Tests in watch mode |
| `npm run test:coverage` | `vitest run --coverage` | Tests with coverage |
| `npm run test:integration` | `vitest run --config vitest.integration.config.ts` | Integration tests (requires Docker) |

---

## Tests

### Unit tests

347 tests across 37 test files, all passing:

| File | Tests | What it verifies |
|---|---|---|
| `lib/adapters/__tests__/ghost.test.ts` | 34 | Ghost JWT creation, healthCheck, setup (fast path via JWT, full setup with cookie extraction, EmailError handling, "already configured" recovery, env var password), uploadTheme (POST with JWT, skip-if-active, missing key, upload failure), publishPost, getPostUrl, error cases |
| `lib/adapters/__tests__/nocodb.test.ts` | 24 | healthCheck, setup (signup → signin → base → table → columns → sample row, default base deletion, env var password), getNextQueued (empty/non-empty, FIFO sort, blank-status filter, field mapping), updateStatus (status + extra fields), getStats (parallel queries, missing pageInfo) |
| `lib/adapters/__tests__/n8n.test.ts` | 28 | healthCheck, setup (fast path with valid key, fallback on invalid key, masked key handling, owner creation, password format, env var password), createCredential, importWorkflow (template immutability, all 5 substitution types), activateWorkflow |
| `lib/__tests__/docker.test.ts` | 3 | reloadCaddy exec command, AdapterError on failure, container-not-found skip |
| `lib/__tests__/adapters-mock.test.ts` | 15 | All mock adapters implement correct interfaces and return expected shapes |
| `lib/__tests__/steps.test.ts` | 5 | 7 steps, correct order, `social` is the only optional step |
| `lib/__tests__/llm-presets.test.ts` | 4 | 4 presets, correct shape, `custom` has empty defaults |
| `lib/__tests__/errors.test.ts` | 5 | `AdapterError` message format, name, instanceof, cause |
| `lib/__tests__/state.test.ts` | 8 | readState/writeState round-trip, atomic write, corrupted file fallback, resetState |
| `lib/__tests__/config.test.ts` | 14 | parseEnv/serializeEnv edge cases (quotes, comments, `=` in values), readEnv/writeEnv round-trip |
| `lib/__tests__/auth.test.ts` | 5 | Valid token passthrough, missing/wrong/malformed header → 401 |
| `lib/__tests__/api-handler.test.ts` | 7 | ZodError → 400, AdapterError → 500, unknown → 500, no detail leaks, console logging |
| `app/api/health/__tests__/route.test.ts` | 2 | Health endpoint returns 200 + `{ status: "ok" }` |
| `app/api/setup/__tests__/schemas.test.ts` | 23 | Zod schemas for all 5 step routes: valid/invalid inputs, edge cases |
| `app/api/setup/__tests__/routes.test.ts` | 20 | All 5 POST routes: 200 on valid, 400 on invalid, 401 without auth, correct state updates, DNS/LLM mocking |
| `components/__tests__/Stepper.test.tsx` | 5 | Renders all labels, highlights current step, shows checkmarks for completed, step numbers, connector lines |
| `components/__tests__/StepLayout.test.tsx` | 9 | Title/description, children, buttons, hide Back, disable Next, spinner, click handlers, custom label |
| `components/__tests__/ServiceStatus.test.tsx` | 6 | Green/red/yellow dot colors, service name, Open link present/absent |
| `app/setup/__tests__/page.test.tsx` | 7 | Default step rendering, next/back navigation, bounds checking, position restore from API, token storage |
| `app/setup/steps/__tests__/Welcome.test.tsx` | 4 | Language selector, Get Started button, submit success, API error display |
| `app/setup/steps/__tests__/Domain.test.tsx` | 4 | Toggle domain/IP mode, domain input visibility, IP mode info, submit success |
| `app/setup/steps/__tests__/LLM.test.tsx` | 4 | Provider selector, Test Connection success/error, submit |
| `app/setup/steps/__tests__/Blog.test.tsx` | 3 | Live preview update, hours→minutes conversion, API error display |
| `app/setup/steps/__tests__/Social.test.tsx` | 3 | Optional step alert, Pinterest/Threads toggles, empty form submit |
| `app/setup/steps/__tests__/Review.test.tsx` | 3 | All config sections displayed, Edit button navigation, API key masking |
| `app/setup/steps/__tests__/Deploy.test.tsx` | 7 | Deploy button, progress bar, checkmarks, error/retry, success URLs, Go to Dashboard |
| `app/api/setup/__tests__/apply.test.ts` | 24 | SSE stream format, all 12 pipeline steps, error handling, startFrom retry, auth, URL generation (domain + IP mode), managed mode Caddyfile |
| `lib/__tests__/caddy.test.ts` | 11 | IP-mode and domain-mode Caddyfile generation, managed mode (no n8n block), writeCaddyfile path handling |
| `lib/__tests__/sse.test.ts` | 4 | createSSEStream, sendSSEEvent format, closeSSE |
| `lib/__tests__/credentials.test.ts` | 7 | Env var password priority, SHA-256 fallback, admin email from domain, default email, all 3 services returned |
| `lib/__tests__/i18n.test.ts` | 4 | Default English locale, Russian locale, all keys in both languages, no empty strings |
| `lib/__tests__/retry.test.ts` | 6 | Success on first try, retry+success, max retries exceeded, exponential backoff, fixed delay, last error passthrough |
| `app/api/dashboard/__tests__/status.test.ts` | 10 | All services healthy/unhealthy, Caddy 404 handling, domain/IP URLs, saas_mode flag, credentials, auth |
| `app/api/dashboard/__tests__/stats.test.ts` | 3 | Article counts, auth, AdapterError handling |
| `app/api/dashboard/__tests__/reconfigure.test.ts` | 5 | Reset deployed/steps, preserve config, auth |
| `app/api/saas/__tests__/health.test.ts` | 5 | 404 when SaaS off, combined health+stats, adapter failures, no auth required |
| `app/dashboard/__tests__/page.test.tsx` | 11 | Service statuses, article stats, quick links, SaaS badge, reconfigure confirm, auto-refresh |

### Integration tests

13 tests across 3 test files. Require `docker compose -f docker-compose.dev.yml up -d` before running:

| File | Tests | What it verifies |
|---|---|---|
| `__tests__/integration/ghost.integration.test.ts` | 4 | healthCheck, setup (admin + API keys), publishPost, getPostUrl against real Ghost |
| `__tests__/integration/nocodb.integration.test.ts` | 5 | healthCheck, setup (base + table + columns), getNextQueued (empty), updateStatus, getStats against real NocoDB |
| `__tests__/integration/n8n.integration.test.ts` | 4 | healthCheck, createCredential, importWorkflow, activateWorkflow against real n8n |

---

## Code conventions

- **TypeScript strict**: `strict: true`, no `any`, no `as` assertions
- **Files**: kebab-case (`llm-presets.ts`), PascalCase for React components (`Welcome.tsx`)
- **Imports**: `@/*` path alias, no deep relative imports
- **Functions over classes**: Adapters use factory functions returning plain objects
- **Async/await**: No `.then()` chains
- **ESLint rules**: `no-explicit-any: error`, `no-unused-vars: error` (except `_` prefix), `consistent-type-imports: warn`
- **Prettier**: single quotes, trailing commas, 100 char width, 2-space indent
- **Zod v4**: `z.record(z.string(), valueSchema)` (not `z.record(valueSchema)` as in v3), `error.issues` instead of `error.errors`

---

## Internationalization (i18n)

**File:** `src/lib/i18n.ts`

Lightweight i18n system — no external libraries. A single file contains all translations for both locales (`en`, `ru`).

| Export | Purpose |
|---|---|
| `getTranslations(locale?)` | Returns the translation object for a locale. Defaults to `'en'`. |
| `useTranslations()` | React hook that reads locale from `localStorage('language')` (set in Welcome step) and returns translations. |

Translations cover: all 7 wizard steps, common UI strings (Next, Back, Save, Edit, Loading), dashboard (services, stats, links, reconfigure), and service descriptions (Ghost, NocoDB, n8n).

Dynamic strings use template placeholders: `t.steps.domain.dnsWrong.replace('{ip}', ...)`.

All components use `useTranslations()` — no hardcoded strings in the UI.

---

## Retry utility

**File:** `src/lib/retry.ts`

Generic retry wrapper with exponential backoff:

```ts
withRetry<T>(fn: () => Promise<T>, options?: {
  maxRetries?: number;   // default: 3
  delayMs?: number;      // default: 1000
  backoff?: boolean;     // default: true (exponential: delayMs * 2^attempt)
}): Promise<T>
```

Intended for adapter healthCheck calls and other critical API operations where transient failures are expected.

---

## Accessibility

ARIA attributes are applied to custom components and form elements:

| Component | ARIA enhancements |
|---|---|
| `Stepper` | `<nav aria-label="Setup progress">`, `<ol>`/`<li>` semantics, `aria-current="step"` on active step |
| `StepLayout` | `aria-label` on Back/Next buttons, `aria-busy` on Next during loading |
| Form steps | `htmlFor`/`id` pairs on all Label+Input, `aria-required` on required fields, `aria-describedby` for helper text |
| Review | `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter) on clickable rows |

---

## CI/CD

**File:** `.github/workflows/ci.yml`

GitHub Actions pipeline triggered on push/PR to `main`. Three parallel jobs:

| Job | Steps |
|---|---|
| `lint-and-test` | `npm ci` → `npm run check` (typecheck + lint + format:check) → `npm test -- --coverage` → upload coverage artifact |
| `docker-build` | `docker build wizard/` → `docker compose config --quiet` |
| `shellcheck` | ShellCheck for `install.sh` and `install-dev.sh` |

---

## Deploy pipeline

**File:** `src/app/api/setup/apply/route.ts`

The deploy endpoint is a 12-step pipeline that configures all services and streams progress via SSE. Unlike other API routes, it uses `withAuth()` only (not `apiHandler()`) since it returns an SSE stream, not JSON.

The pipeline is **fully idempotent** — re-deploying without resetting volumes works correctly. Each adapter has a "fast path" that verifies existing credentials before full setup.

### Pipeline steps

| # | Step | Action |
|---|---|---|
| 1 | Save .env | Merges configuration variables into `.env` (preserves existing adapter keys) |
| 2 | Generate Caddyfile | Creates reverse proxy config (IP or domain mode). Passes `INSTANCE_MODE` — managed omits n8n block |
| 3 | Checking services | Verifies Ghost, NocoDB, n8n are healthy (wizard has no Docker CLI) |
| 4 | Reload Caddy | Applies new Caddyfile via Docker exec |
| 5 | Ghost setup | Creates admin account, Custom Integration (fast path: verify existing keys via JWT) |
| 6 | Upload theme | Uploads `openant-source` custom theme (skips if already active). Theme zip mounted from `ghost/themes/` |
| 7 | Ghost settings | No-op (already configured in step 5) |
| 8 | NocoDB setup | Creates admin account, base, and table; removes default bases; inserts sample row |
| 9 | n8n setup | Auto-provisions API key (fast path: verify existing key) |
| 10 | n8n credentials | Creates 2 credentials (LLM API, NocoDB). Managed mode: reads LLM key from env vars instead of wizard state |
| 11 | n8n workflows | Imports and activates generate + promote workflows. Managed mode: reads model from env |
| 12 | Finalize | Merges adapter keys into .env, sets `deployed: true`. Managed mode: excludes n8n from deploy result |

### Context hydration

Before executing steps, the pipeline unconditionally reads `.env` and hydrates both `DeployContext` and `process.env` with previously saved adapter keys (Ghost, NocoDB, n8n). This ensures fast paths work on re-deploy and intermediate steps have access to keys from prior runs.

### SSE protocol

Three event types:

- `step` — `{ step, total, label, status: 'running' | 'completed' }` — emitted before and after each step
- `error` — `{ step, label, error, recoverable: true }` — emitted on failure, pipeline stops
- `complete` — `{ success: true, urls: { blog, table, n8n } }` — emitted after all steps

### DeployContext

Intermediate data (Ghost API keys, NocoDB tokens, n8n credential IDs) flows between steps via a local `DeployContext` object — not persisted to `state.json`. This keeps `SetupState` clean and avoids Zod schema conflicts.

### Deploy UI

**File:** `src/app/setup/steps/Deploy.tsx`

Uses `fetch` + `ReadableStream.getReader()` to consume SSE (not `EventSource`, which doesn't support POST/headers). Shows progress bar, step list with icons (Check/Loader2/X/Circle from lucide-react), error with retry button, and success with service URLs.

---

## SaaS mode

The `OPENANT_SAAS_MODE` environment variable enables minimal SaaS hooks for Control Plane integration:

| Feature | Behavior when `OPENANT_SAAS_MODE=true` |
|---|---|
| Domain step | Skipped in wizard (Control Plane manages DNS) |
| Dashboard badge | Shows "Managed by openant SaaS" |
| `/api/saas/health` | Returns combined health + article stats (no auth) |
| Reconfigure | Domain step stays completed (cannot be changed) |

When the env var is absent or any value other than `'true'`, all SaaS features are disabled and the system behaves as a standard self-hosted installation.

### Instance mode (managed vs BYOK)

The `INSTANCE_MODE` environment variable (`managed` or `byok`, default `byok`) controls which features are available. Set by the SaaS Control Plane during cloud-init based on the user's subscription plan (`pro` → `managed`, `starter` → `byok`).

| Feature | BYOK (`byok`) | Managed (`managed`) |
|---|---|---|
| LLM setup step | Shown in wizard (user enters API key) | Skipped (key pre-injected via cloud-init) |
| n8n Caddy block | Included (accessible via `auto.{slug}` subdomain) | Omitted (n8n only accessible via IP:5678) |
| n8n in dashboard | URL and credentials shown | Hidden |
| n8n in deploy result | Credentials included | Excluded |
| LLM credentials | From wizard state (`state.llm`) | From environment variables (`LLM_API_KEY`, etc.) |

**Wizard behavior:**
- `GET /api/setup/status` returns `instance_mode` field
- `setup/page.tsx` detects mode and filters steps (removes LLM for managed)
- `POST /api/setup/apply` uses mode for Caddyfile generation, LLM credential source, and deploy result filtering
- `GET /api/dashboard/status` hides n8n URL and credentials for managed

---

## Installation

**File:** `install.sh`

One-command installer script for deploying openant. Supports Linux (production) and macOS (local testing with Docker Desktop).

### Prerequisites

**Linux (production):**
- Root access (sudo)
- Ubuntu 20.04+ or Debian 11+ (CentOS/RHEL best-effort)
- amd64 or arm64 architecture
- Ports 80, 443, 3000 available

**macOS (local testing):**
- Docker Desktop installed and running
- No root required (Docker Desktop runs as user)

### What it does

| # | Step | Action |
|---|------|--------|
| 1 | `check_root()` | Verify running as root (skipped on macOS) |
| 2 | `check_os()` | Detect distro, version, architecture (`sw_vers` on macOS) |
| 3 | `check_docker()` | Verify Docker + Compose plugin; install if missing |
| 4 | `check_ports()` | Verify 80/443/3000 available (skipped if openant containers running) |
| 5 | `setup_directory()` | `git clone` or tarball fallback to `/opt/openant` |
| 6 | `generate_secrets()` | Generate `.env` from `.env.example` with random secrets |
| 7 | `start_services()` | `docker compose up -d --build` + wait for healthchecks (180s timeout) |
| 8 | `print_result()` | Display wizard URL with SETUP_TOKEN |

### macOS adaptations

The script detects the OS via `uname -s` and branches accordingly:

| Area | Linux | macOS |
|------|-------|-------|
| Root check | Required | Skipped |
| OS detection | `/etc/os-release` | `sw_vers` |
| Docker install | `get.docker.com` + systemctl | Error → link to Docker Desktop |
| Port check | `ss -tlnp` | `lsof -iTCP` |
| sed in-place | `sed -i` | `sed -i ''` |
| Docker GID | `getent group docker` | `0` (not used) |
| Server IP | `curl ifconfig.me` | `127.0.0.1` |

### Idempotency

- Re-running is safe: existing `.env` is never overwritten
- Code is updated via `git pull --ff-only`
- Running containers are detected (port check skipped)

### Uninstall

`install.sh --uninstall` — stops containers, removes volumes, deletes `/opt/openant` (with confirmation prompt).

---

## E2E tests

**File:** `tests/e2e/run.sh`

Automated end-to-end test that validates the full wizard flow on a deployed instance. Reads `SETUP_TOKEN` and `SERVER_IP` from `/opt/openant/.env`.

9 sequential tests: health, welcome, domain, LLM, blog, social, deploy (SSE stream), dashboard status, dashboard stats.

Requires: `curl`, `jq`. Designed for fresh installations (wizard state is not reset between runs).

---

## What's next

- Production hardening
- E2E test automation in CI
- Additional locales
