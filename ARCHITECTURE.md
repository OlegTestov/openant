# openant — Architecture Overview

> Last updated: 2026-03-14

---

## What is openant

Self-hosted platform for automated content generation and promotion. Orchestrates Ghost (blog), NocoDB (spreadsheet/queue), n8n (automation), and Caddy (reverse proxy) through a Next.js Setup Wizard. One-command VPS install, web-based config wizard, automatic SEO article generation, blog publishing, and social media promotion.

---

## Repository structure

```
openant/
├── docker-compose.yml             # Production: 7 services
├── docker-compose.dev.yml         # Development: infra only (no wizard/caddy)
├── install.sh                     # One-command installer script
├── install-dev.sh                 # Local dev installer (rsync from current dir, /tmp/openant-dev)
├── .env.example                   # All environment variables with defaults
├── ARCHITECTURE.md                # This file
├── LICENSE                        # MIT License
│
├── tests/e2e/run.sh               # End-to-end test script
├── caddy/Caddyfile                # Initial IP-mode reverse proxy config
│
├── n8n/workflows/
│   ├── generate-article.template.json   # Article generation + Pinterest + Telegram
│   └── telegram-bot.template.json       # Telegram bot for content creation
│
├── make/blueprint.json            # Make.com scenario template (Pinterest)
│
├── ghost/
│   ├── fake-sendmail.sh           # Null mailer (avoids SMTP requirement)
│   └── themes/
│       ├── openant-source/        # Forked Source v1.5.0 theme
│       ├── openant-source.zip     # Pre-built theme zip
│       └── build-theme.sh         # Rebuilds zip from openant-source/
│
├── .github/workflows/ci.yml      # GitHub Actions CI pipeline
├── docs/                          # Design documentation (specs, plans)
│
├── wizard/                        # Next.js application (the only custom code)
│   ├── Dockerfile                 # Multi-stage build (builder -> runner)
│   ├── src/
│   │   ├── app/                   # Next.js App Router (pages + API routes)
│   │   │   ├── page.tsx           # Root redirect (-> /setup or /dashboard)
│   │   │   ├── api/setup/         # Step API routes + deploy endpoint
│   │   │   ├── api/dashboard/     # Dashboard API routes
│   │   │   ├── api/saas/          # SaaS health endpoint (no auth)
│   │   │   ├── dashboard/page.tsx # Dashboard page
│   │   │   └── setup/
│   │   │       ├── page.tsx       # Wizard container
│   │   │       └── steps/         # Step form components
│   │   ├── components/            # Stepper, StepLayout, ServiceStatus, ThemeToggle, ui/
│   │   ├── lib/                   # Business logic, adapters, utilities
│   │   ├── types/                 # Shared TypeScript types
│   │   ├── test/                  # Unit test setup
│   │   └── __tests__/integration/ # Integration tests (real Docker services)
│   ├── next.config.ts
│   ├── vitest.config.ts           # Unit test config (jsdom)
│   ├── vitest.integration.config.ts  # Integration test config (node)
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── .prettierrc
│   └── package.json
```

The `wizard/` directory is the only custom code. Everything else runs as unmodified Docker images.

---

## Technology stack

| Layer         | Technology                  | Purpose                    |
| ------------- | --------------------------- | -------------------------- |
| Framework     | Next.js 16 (App Router)     | Wizard UI + API routes     |
| Language      | TypeScript (strict mode)    | Type safety                |
| Validation    | Zod v4                      | Runtime schema validation  |
| Styling       | Tailwind CSS v4 + shadcn/ui | UI components              |
| Testing       | Vitest + Testing Library    | Unit and component tests   |
| Containers    | Docker Compose              | 7-service orchestration    |
| Reverse proxy | Caddy 2                     | Auto-HTTPS, domain routing |
| Linting       | ESLint (flat config)        | Code quality               |
| Formatting    | Prettier                    | Code style                 |
| Build         | `output: "standalone"`      | Minimal Docker-ready build |

---

## Docker infrastructure

### Production (`docker-compose.yml`)

7 services on shared bridge network (`openant_net`):

| Service    | Image                   | Container          | Purpose                        |
| ---------- | ----------------------- | ------------------ | ------------------------------ |
| `wizard`   | Custom (Dockerfile)     | `openant-wizard`   | Setup Wizard + API (port 3000) |
| `ghost`    | `ghost:5`               | `openant-ghost`    | Blog engine                    |
| `ghost-db` | `mysql:8.0`             | `openant-ghost-db` | Ghost database                 |
| `nocodb`   | `nocodb/nocodb:0.260.0` | `openant-nocodb`   | Spreadsheet UI / topic queue   |
| `db`       | `postgres:16-alpine`    | `openant-db`       | NocoDB database                |
| `n8n`      | `n8nio/n8n:2.9.2`       | `openant-n8n`      | Workflow automation            |
| `caddy`    | `caddy:2-alpine`        | `openant-caddy`    | Reverse proxy with auto-HTTPS  |

All services have healthchecks and JSON file logging (`max-size: 10m`, `max-file: 3`). 7 named volumes: `ghost_content`, `ghost_db_data`, `nocodb_data`, `postgres_data`, `n8n_data`, `caddy_data`, `caddy_config`.

### Development (`docker-compose.dev.yml`)

Same infra but **no wizard** (runs on host) and **no caddy** (direct port access). Hardcoded dev passwords. Ports: Ghost `:2368`, NocoDB `:8080`, n8n `:5678`.

### Wizard Dockerfile

Multi-stage build: **Builder** (`node:20-alpine`, `npm ci`, `npm run build`) -> **Runner** (`node:20-alpine`, non-root `nextjs` user, `DOCKER_GID` build arg for Docker socket, curl for healthcheck). Key env: `STATE_PATH=/app/data/state.json`, `PORT=3000`.

SaaS mode env vars: `INSTANCE_MODE` (`managed`/`byok`), `GHOST_ADMIN_PASSWORD`, `NOCODB_ADMIN_PASSWORD`, `N8N_ADMIN_PASSWORD` (random, injected by cloud-init).

### Caddy configuration

**File:** `caddy/Caddyfile` -- initial IP-mode config (`:80 -> ghost:2368`), regenerated during deploy:

- **IP mode**: Single `:80` -> Ghost. Other services via direct ports.
- **Domain mode**: 4 server blocks with auto-HTTPS (main->Ghost, table.X->NocoDB, auto.X->n8n, setup.X->wizard). SaaS adds `tls /opt/openant/certs/fullchain.pem /opt/openant/certs/privkey.pem` (wildcard cert).

### Custom Ghost theme (`openant-source`)

Fork of Source v1.5.0 with: (1) dark mode toggle replacing search icon, persisted in `localStorage` with `prefers-color-scheme` default and flash-prevention script; (2) built-in dark CSS via `html[data-theme="dark"]` selector; (3) feature image above title in `post.hbs`.

Pre-built as `openant-source.zip`, mounted into wizard via Docker volume. Uploaded during deploy step 6 via Ghost Admin API (skipped if already active). Rebuild: `bash ghost/themes/build-theme.sh`.

---

## n8n workflow templates

Two templates in `n8n/workflows/`, imported during deploy step 11 with placeholder substitution.

### generate-article.template.json

Pipeline with system/user prompt split, image generation, optional Pinterest promotion, and error retry:

```
Schedule Trigger -> Get Next Queued (blank/publishing/error status) -> Has Records?
  -> Is Pin Retry? (Status=error AND GhostURL not empty)
    -> true: Update Status: promoting -> retry pin generation flow
    -> false: Update status: generating -> Get Prompts -> Generate Title (LLM)
       -> Generate Article (LLM) -> Generate & Upload Image -> publishing
       -> Build Ghost JWT -> POST to Ghost -> published -> Check Pinterest
         -> false: completed (no pin)
         -> true: Generate Pin Title/Text/Image -> Make Webhook -> Save Pin URL -> completed
  -> article-stage errors: Status: error (no GhostURL -> full retry next cycle)
  -> pin-stage errors: Status: error (GhostURL present -> pin-only retry next cycle)
```

**Error retry**: Records with `error` status auto-picked up next cycle. "Is Pin Retry?" distinguishes article errors (full retry) from pin errors (pin-only retry, clears Error field).

**System/user prompt split**: Each LLM call uses a `system` message (static, from NocoDB Prompts table) and `user` message (dynamic: topic, description, link). Prompts fully rendered at deploy time.

**Image generation**: Code node calls LLM API with `modalities: ['text', 'image']`, uploads base64 PNG to Ghost Admin API. Fails silently (article publishes without image). 120s timeout.

**HTML sanitization**: Post-processes article HTML wrapping bare text in `<p>` tags to prevent Ghost Source theme layout issues.

**Pinterest promotion**: If `{{MAKE_WEBHOOK_URL}}` configured, generates pin title/text/image via LLM (system prompts from Prompts table), sends webhook to Make.com (`{ board, title, description, url, imageUrl }`). Make responds with `{ success, pin_id, pin_url }`. Pin errors auto-retry next cycle.

**Telegram notifications**: After publish/error, checks `{{TELEGRAM_BOT_TOKEN}}`. If set, sends notification with article fields. Uses `onError: continueRegularOutput` so failures don't break pipeline.

**Make.com blueprint** (`make/blueprint.json`): 7-module scenario (Webhook -> List Boards -> Aggregator -> Set Variable -> Create Pin -> Webhook Response). Download via `/api/make-blueprint`.

### telegram-bot.template.json

Conversational workflow for creating content plan entries via Telegram:

```
Telegram Trigger -> Handle Message (single Code node with inline HTTP)
  /start: Save chat_id to NocoDB Prompts.TelegramChatId
  Forwarded message: Save description (text or caption), reply "Send Topic"
  Topic: Save topic, reply "Send Link or /skip"
  Link: Create NocoDB article row (POST as array), reply confirmation
  Fallback: reply "Forward a message to start"
```

Uses `require('https')`/`require('http')` for inline HTTP calls (needs `NODE_FUNCTION_ALLOW_BUILTIN`).
NocoDB auth via `xc-token` header (long-lived API token). NocoDB v2 POST requires array body `[{...}]`.
State via `$getWorkflowStaticData('global')` keyed by `chat_id` with 1-hour TTL.

### Ghost Admin API and TLS

n8n calls Ghost Admin API via HTTPS through Caddy. SaaS domains use a wildcard Let's Encrypt cert (`*.openant.app`). To accept this cert in n8n:

- **Code nodes** (Node.js `https` module): `NODE_TLS_REJECT_UNAUTHORIZED=0` in docker-compose.yml
- **HTTP Request nodes** (Axios): `allowUnauthorizedCerts: true` on the node

`{{GHOST_API_URL}}` (SaaS domain) is used for Admin API calls; `{{GHOST_URL}}` (custom domain if set) for public article links. Substitution order matters: `GHOST_API_URL` must be replaced before `GHOST_URL` to prevent partial matching.

### Placeholder substitution

| Placeholder                   | Type                       | Source                                                |
| ----------------------------- | -------------------------- | ----------------------------------------------------- |
| `{{NOCODB_TABLE_ID}}`         | String replacement         | `WorkflowParams.nocodbTableId`                        |
| `{{NOCODB_PROMPTS_TABLE_ID}}` | String replacement         | `WorkflowParams.nocodbPromptsTableId`                 |
| `{{LLM_API_URL}}`             | String replacement         | `WorkflowParams.llmApiUrl`                            |
| `{{LLM_API_KEY}}`             | String replacement         | `WorkflowParams.llmApiKey`                            |
| `{{LLM_IMAGE_MODEL}}`         | String replacement         | `WorkflowParams.llmImageModel`                        |
| `{{GHOST_ADMIN_API_KEY}}`     | String replacement         | `WorkflowParams.ghostAdminApiKey`                     |
| `{{GHOST_URL}}`               | String replacement         | `WorkflowParams.ghostUrl` (public links)              |
| `{{GHOST_API_URL}}`           | String replacement         | `WorkflowParams.ghostApiUrl` (SaaS domain, Admin API) |
| `{{MAKE_WEBHOOK_URL}}`        | String replacement         | `WorkflowParams.makeWebhookUrl`                       |
| `{{PINTEREST_BOARD}}`         | String replacement         | `WorkflowParams.pinterestBoard`                       |
| `{{TELEGRAM_BOT_TOKEN}}`      | String replacement         | `WorkflowParams.telegramBotToken`                     |
| `{{TELEGRAM_CHAT_ID}}`        | String replacement         | `WorkflowParams.telegramChatId`                       |
| `{{NOCODB_AUTH_TOKEN}}`       | String replacement         | `WorkflowParams.nocodbAuthToken`                      |
| `minutesInterval`             | Structured (schedule node) | `WorkflowParams.scheduleIntervalMinutes`              |
| `model`                       | Structured (OpenAI node)   | `WorkflowParams.llmModel`                             |
| `url` (Make node)             | Structured (HTTP node)     | `WorkflowParams.makeWebhookUrl`                       |
| `credentials.*.id`            | Structured (all nodes)     | `WorkflowParams.credentialIds`                        |

### NocoDB Prompts table

Created during deploy with 7 system prompt columns. `{language}` and `{tone}` placeholders substituted at deploy time.

| Column           | Purpose                                     |
| ---------------- | ------------------------------------------- |
| `ArticleTitle`   | SEO headline generation prompt              |
| `ArticleText`    | Full article HTML generation prompt         |
| `ArticleImage`   | Blog cover image generation prompt          |
| `PinName`        | Pinterest pin title prompt                  |
| `PinText`        | Pinterest pin description prompt            |
| `PinImage`       | Pinterest pin image generation prompt       |
| `ThreadText`     | Social media post prompt                    |
| `TelegramChatId` | Auto-detected chat ID from `/start` command |

---

## Adapter system

Core pattern: each external service has a TypeScript adapter interface. Replacing a service means writing a new adapter.

### Four adapter types

| Interface             | Responsibility                                                 | Implementation                        |
| --------------------- | -------------------------------------------------------------- | ------------------------------------- |
| `BlogAdapter`         | Publish articles, manage blog                                  | Ghost (`src/lib/adapters/ghost.ts`)   |
| `TableAdapter`        | FIFO topic queue, status tracking, articles CRUD, prompts mgmt | NocoDB (`src/lib/adapters/nocodb.ts`) |
| `AutomationAdapter`   | Workflow orchestration                                         | n8n (`src/lib/adapters/n8n.ts`)       |
| `DistributionAdapter` | Social media posting                                           | Interface only (Make.com)             |

### Key files

- **`types.ts`** -- All adapter interfaces. Central contract; changes affect all consumers.
- **`index.ts`** -- Registry. `createAdapters()` returns `Adapters` object with all three adapters.
- **`ghost.ts`** -- **Fast path**: if `GHOST_ADMIN_API_KEY` + `GHOST_CONTENT_API_KEY` exist, verifies via JWT (avoids login EmailError on re-deploy). **Full setup**: admin account -> session cookie -> Custom Integration -> settings. `uploadTheme()` uploads openant-source zip (skips if active). JWT via hand-rolled HMAC-SHA256. Helpers: `requireAdminJwt()`, `assertOk()`, `getAdminEmail()`.
- **`nocodb.ts`** -- Multi-step setup (signup -> signin -> base -> table -> columns -> sample row), removes default bases, FIFO queue via blank-status filter, parallel stats. CRUD for articles and prompts (used by SaaS dashboard).
- **`n8n.ts`** -- **Fast path**: if `N8N_API_KEY` exists, verifies against `/api/v1/workflows`. **Full setup**: deterministic password (`N<hex>!`), create owner -> login -> manage API keys (skip masked, delete stale) -> create fresh key. Credential management, workflow import with substitution, activation.
- **`__mocks__/`** -- Mock adapters returning deterministic data. Used for tests and Docker-free UI dev.

### Ghost JWT

`createGhostJwt(adminApiKey)` in `ghost.ts` -- HMAC-SHA256 with hex-decoded secret from `key_id:hex_secret` format. `kid` in header, `aud: '/admin/'` in payload. Node.js `crypto` only.

### Docker utilities (`src/lib/docker.ts`)

- `startServices()` -- Polls healthCheck endpoints for Ghost/NocoDB/n8n. Throws `AdapterError` if unreachable.
- `reloadCaddy()` -- `docker exec openant-caddy caddy reload`. Throws `AdapterError` on failure.

### Domain resolution (`src/lib/domain.ts`, `src/lib/server-ip.ts`)

- `getEffectiveDomain(state)` -- Resolves domain from wizard state, falls back to `DOMAIN` env var.
- `getServiceDomains(state)` -- Builds SaaS flat subdomain map (`slug-blog.openant.app`).
- `getCustomDomains(state)` -- Returns custom domain map from configurable prefixes (`blog.example.com`, `setup.example.com`, etc.) if user configured one, else `null`.
- `hasCustomDomain(state)` -- Boolean check for custom domain presence.
- `isSaasMode()` -- `true` when `DOMAIN` env var is set (SaaS-provisioned instance).
- `getServerIp()` -- `SERVER_IP` env var or fetches from `ifconfig.me`.

### Caddyfile generator (`src/lib/caddy.ts`)

- `generateCaddyfile(domains, mode?, saas?, customDomains?)` -- IP mode (null domains): `:80` -> Ghost. Domain mode: 4 server blocks. SaaS adds `tls /opt/openant/certs/fullchain.pem /opt/openant/certs/privkey.pem` (wildcard cert). Optional 4th param adds custom domain blocks with Let's Encrypt.
- `writeCaddyfile(content)` -- Writes to `CADDYFILE_PATH` (default: `/app/Caddyfile`).

### SSE streaming (`src/lib/sse.ts`)

- `createSSEStream()` -- Returns `{ stream, controller }`.
- `sendSSEEvent(controller, event, data)` -- Formats SSE message.
- `closeSSE(controller)` -- Closes stream.

### Service credentials (`src/lib/credentials.ts`)

`getServiceCredentials(setupToken, domain?)` -- Reads passwords from env vars (`GHOST_ADMIN_PASSWORD`, etc.) with SHA-256 derivation fallback. SaaS injects random passwords via cloud-init. Email: `admin@{domain}` or `admin@openant.local`.

Each adapter reads its own env var: Ghost/NocoDB use SHA-256 fallback, n8n uses `N<hex>!` fallback.

### Other utilities

- **`utils.ts`** -- `cn()` (clsx + tailwind-merge)
- **`download.ts`** -- Client-side Make blueprint download via `/api/make-blueprint`

### Environment variable strategy

Adapters read env vars at call time (not module load), since keys don't exist at startup -- written during deploy. Base URLs have Docker-internal defaults. Each adapter step persists keys to `.env` immediately, enabling fast-path recovery on re-deploy. Step 1 merges (not overwrites) `.env`.

### Adapter rules

1. One file = one adapter. No nested folders.
2. Factory function, not class.
3. Stateless -- config from env vars or parameters.
4. No cross-adapter calls.
5. Docker-internal URLs only (`http://ghost:2368`).

---

## State management

### state.json -- setup-time storage (`src/lib/state.ts`)

`SetupState` type (`src/types/setup.ts`): `currentStep`, `deployed`, per-step status, section data.

| Function       | Behavior                                                              |
| -------------- | --------------------------------------------------------------------- |
| `readState()`  | Reads + validates via Zod. Returns `DEFAULT_STATE` if missing/corrupt |
| `writeState()` | Atomic write (`.tmp` + `fs.rename()`)                                 |
| `resetState()` | Writes `DEFAULT_STATE`                                                |

Path via `STATE_PATH` env var (default: `/app/data/state.json`), read at call time for test overrides.

### .env -- runtime storage (`src/lib/config.ts`)

| Function         | Behavior                                                             |
| ---------------- | -------------------------------------------------------------------- |
| `parseEnv()`     | Skips comments/empty lines, splits on first `=`, strips quotes       |
| `serializeEnv()` | Values with spaces wrapped in double quotes                          |
| `readEnv()`      | Returns `{}` if file missing                                         |
| `writeEnv()`     | Direct `fs.writeFile` (no temp+rename -- `.env` may be bind-mounted) |

### Lifecycle

```
UI Forms -> API Route (Zod validate) -> state.json -> Deploy -> .env + Service APIs
```

During setup: `state.json` is source of truth. After deploy: `.env` is source of truth.

---

## Authentication (`src/lib/auth.ts`)

All endpoints (except `/api/health`, `/api/saas/health`) protected by `SETUP_TOKEN` via `withAuth()`:

```
Request -> withAuth() -> check "Authorization: Bearer <token>" -> handler or 401
```

Usage: `export const POST = withAuth(apiHandler(async (req) => { ... }));`

---

## Error handling

### AdapterError (`src/lib/errors.ts`)

```
AdapterError { adapter, operation, message, cause? }
```

### API handler (`src/lib/api-handler.ts`)

| Error type      | HTTP | Code               | Details                   |
| --------------- | ---- | ------------------ | ------------------------- |
| `z.ZodError`    | 400  | `VALIDATION_ERROR` | First issue message       |
| `AdapterError`  | 500  | `ADAPTER_ERROR`    | Full message (logged)     |
| Unknown `Error` | 500  | `INTERNAL_ERROR`   | Generic message (no leak) |

Zod v4: uses `error.issues[0].message` (not v3 `error.errors`).

---

## Wizard UI

Multi-step form: Stepper (progress), step content, navigation buttons.

### Routing (`src/app/page.tsx`)

Server Component redirects: `deployed: false` -> `/setup`, `deployed: true` -> `/dashboard`.

### Dashboard (`src/app/dashboard/page.tsx`)

Client component: service health via `ServiceStatus` components, article stats by status, quick links, 30s auto-refresh, reconfigure button (resets deploy state), SaaS badge when `OPENANT_SAAS_MODE=true`.

### Wizard container (`src/app/setup/page.tsx`)

Client component managing: token from URL -> `localStorage`, position restore via `/api/setup/status`, SaaS mode (filters out Domain step), managed mode (filters out LLM step), index-based navigation.

### Step props (`src/types/step-props.ts`)

```ts
interface StepProps {
  onComplete: (savedData?: Record<string, unknown>) => void;
  onBack?: () => void;
  onGoToStep?: (index: number) => void;
  initialData?: Record<string, unknown>;
}
```

### Reusable components

| Component       | Purpose                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `Stepper`       | Horizontal progress with numbered circles, check icons, `aria-current="step"` |
| `StepLayout`    | Step wrapper with title, Card, i18n Back/Next buttons, loading state          |
| `ServiceStatus` | Health dot (green/red/yellow+pulse) + name + optional "Open" link             |
| `ThemeToggle`   | Dark/light toggle via `next-themes`                                           |

---

## Wizard steps

Linear sequence: each step has UI component + API route + Zod schema.

### Step registry (`src/lib/steps.ts`)

| #   | ID         | Required |
| --- | ---------- | -------- |
| 1   | `welcome`  | Yes      |
| 2   | `domain`   | Yes      |
| 3   | `llm`      | Yes      |
| 4   | `blog`     | Yes      |
| 5   | `telegram` | No       |
| 6   | `social`   | No       |
| 7   | `review`   | Yes      |
| 8   | `deploy`   | Yes      |

### Common step pattern

1. Local state via `useState` -> POST to `/api/setup/{step}` with Bearer token
2. Success -> `onComplete()` | Error -> `<Alert variant="destructive">` | Loading -> `StepLayout.isLoading`

### Step details

| Step         | Key behavior                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------- |
| **Welcome**  | Language selector (`en`/`ru`), saves to localStorage                                            |
| **Domain**   | Switch (domain/IP mode), configurable subdomain prefixes (blog/table/auto/setup), DNS check     |
| **LLM**      | Preset selector, URL/Key/Model inputs, test via `POST {api_url}/chat/completions` (10s timeout) |
| **Blog**     | Title (max 100), description, language, tone, interval (min 10m), live preview                  |
| **Telegram** | Optional. Bot token + optional chat ID (auto-detected from `/start`)                            |
| **Social**   | Optional. Webhook URL, Pinterest/Threads toggles, Make template download                        |
| **Review**   | Read-only config cards with Edit buttons, API key masked as `*****`                             |
| **Deploy**   | SSE progress, 12-step pipeline, retry from failed step, service URLs on success                 |

---

## LLM presets (`src/lib/llm-presets.ts`)

All providers are OpenAI-compatible (no adapter needed):

| Provider   | Default model                   | Default image model                     |
| ---------- | ------------------------------- | --------------------------------------- |
| OpenRouter | `google/gemini-3-flash-preview` | `google/gemini-3.1-flash-image-preview` |
| OpenAI     | `gpt-4o-mini`                   | `gpt-4o-mini`                           |
| DeepSeek   | `deepseek-chat`                 | `deepseek-chat`                         |
| Custom     | (user-provided)                 | (user-provided)                         |

---

## API conventions

- **Auth**: `withAuth()` -- `Authorization: Bearer <SETUP_TOKEN>`
- **Response**: `{ success: true, data? }` or `{ success: false, error, code? }`
- **Errors**: `apiHandler()` catches ZodError (400), AdapterError (500), unknown (500)
- **Validation**: Zod v4 schemas inline next to route
- **Composition**: `withAuth(apiHandler(async (req) => { ... }))`

### Endpoints

| Endpoint                                   | Auth | Description                                                           |
| ------------------------------------------ | ---- | --------------------------------------------------------------------- |
| `GET /api/health`                          | No   | `{ status: "ok" }` for Docker healthcheck                             |
| `GET /api/setup/status`                    | Yes  | Current state, masked keys, `instance_mode`, `saas_mode`, `server_ip` |
| `POST /api/setup/welcome`                  | Yes  | Validate language, save, advance                                      |
| `POST /api/setup/domain`                   | Yes  | Validate domain, DNS check if domain mode                             |
| `POST /api/setup/llm`                      | Yes  | Validate LLM config, test connection (non-blocking)                   |
| `POST /api/setup/blog`                     | Yes  | Validate blog config (title, language, tone, interval)                |
| `POST /api/setup/telegram`                 | Yes  | Validate telegram config (optional step)                              |
| `POST /api/setup/social`                   | Yes  | Validate social config (all optional)                                 |
| `GET /api/setup/mode`                      | No   | Returns `instance_mode` (byok/managed) without auth                   |
| `POST /api/setup/preflight`               | Yes  | Pre-deploy health checks (services, LLM, Telegram, DNS, webhook)      |
| `GET /api/make-blueprint`                  | Yes  | Download `make/blueprint.json`                                        |
| `POST /api/setup/apply`                    | Yes  | SSE deploy pipeline, supports `?startFrom=N`                          |
| `GET /api/dashboard/status`                | Yes  | Service health, URLs, credentials, `saas_mode`. Managed: n8n hidden   |
| `GET /api/dashboard/stats`                 | Yes  | Article counts by status                                              |
| `POST /api/dashboard/reconfigure`          | Yes  | Reset deploy state, preserve config                                   |
| `GET /api/saas/health`                     | No   | 404 if SaaS off; combined health + stats for Control Plane            |
| `GET/POST/PATCH/DELETE /api/saas/articles` | Yes  | Articles CRUD. DELETE guarded: queue/error status only                |
| `GET/PATCH /api/saas/prompts`              | Yes  | Read/update LLM prompts in Prompts table                              |
| `POST /api/saas/restart`                   | Yes  | Restart Docker containers (except wizard), wait for healthy           |
| `POST /api/saas/update`                    | Yes  | Trigger instance update (git pull, rebuild, restart)                  |
| `GET /api/saas/update-status`              | Yes  | Get update progress status                                            |

---

## UI components

10 shadcn/ui components in `src/components/ui/`: `button`, `input`, `select`, `switch`, `card`, `label`, `badge`, `progress`, `alert`, `textarea`.

3 custom components in `src/components/`: `Stepper`, `StepLayout`, `ServiceStatus`.

---

## Scripts

| Script                     | Purpose                             |
| -------------------------- | ----------------------------------- |
| `npm run dev`              | Development server                  |
| `npm run build`            | Production build (standalone)       |
| `npm run start`            | Start production server             |
| `npm run lint`             | ESLint                              |
| `npm run typecheck`        | `tsc --noEmit`                      |
| `npm run format`           | Prettier auto-format                |
| `npm run format:check`     | Verify formatting                   |
| `npm run check`            | typecheck + lint + format:check     |
| `npm test`                 | Run unit tests (37 files)           |
| `npm run test:watch`       | Watch mode                          |
| `npm run test:coverage`    | Tests with coverage                 |
| `npm run test:integration` | Integration tests (requires Docker) |

---

## Tests

### Unit tests

377 tests across 39 files:

| File                                              | Tests | What it verifies                                                                                                    |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| `lib/adapters/__tests__/ghost.test.ts`            | 34    | JWT, healthCheck, setup (fast path, full, EmailError, recovery, env password), uploadTheme, publishPost, errors     |
| `lib/adapters/__tests__/nocodb.test.ts`           | 24    | healthCheck, setup (full flow, default base deletion, env password), getNextQueued, updateStatus, getStats          |
| `lib/adapters/__tests__/n8n.test.ts`              | 31    | healthCheck, setup (fast path, masked keys, owner creation, password format), credentials, importWorkflow, activate |
| `lib/__tests__/docker.test.ts`                    | 3     | reloadCaddy exec, AdapterError on failure, container-not-found skip                                                 |
| `lib/__tests__/adapters-mock.test.ts`             | 15    | Mock adapters implement correct interfaces                                                                          |
| `lib/__tests__/steps.test.ts`                     | 5     | 8 steps, correct order, optional steps                                                                              |
| `lib/__tests__/llm-presets.test.ts`               | 4     | 4 presets, correct shape                                                                                            |
| `lib/__tests__/errors.test.ts`                    | 5     | AdapterError message, name, instanceof, cause                                                                       |
| `lib/__tests__/state.test.ts`                     | 8     | readState/writeState round-trip, atomic write, corrupted fallback, reset                                            |
| `lib/__tests__/config.test.ts`                    | 14    | parseEnv/serializeEnv edge cases, readEnv/writeEnv round-trip                                                       |
| `lib/__tests__/auth.test.ts`                      | 5     | Valid token, missing/wrong/malformed header -> 401                                                                  |
| `lib/__tests__/api-handler.test.ts`               | 7     | ZodError -> 400, AdapterError -> 500, unknown -> 500, no leaks                                                      |
| `app/api/health/__tests__/route.test.ts`          | 2     | 200 + `{ status: "ok" }`                                                                                            |
| `app/api/make-blueprint/__tests__/route.test.ts`  | 2     | Auth required, returns blueprint with Content-Disposition                                                           |
| `app/api/setup/__tests__/schemas.test.ts`         | 32    | Zod schemas for all 6 step routes                                                                                   |
| `app/api/setup/__tests__/routes.test.ts`          | 20    | All 5 POST routes: 200/400/401, state updates, DNS/LLM mocking                                                      |
| `components/__tests__/Stepper.test.tsx`           | 5     | Labels, current step, checkmarks, numbers, connectors                                                               |
| `components/__tests__/StepLayout.test.tsx`        | 9     | Title, buttons, hide/disable, spinner, click handlers                                                               |
| `components/__tests__/ServiceStatus.test.tsx`     | 6     | Dot colors, service name, Open link                                                                                 |
| `app/setup/__tests__/page.test.tsx`               | 7     | Default step, navigation, bounds, position restore, token storage                                                   |
| `app/setup/steps/__tests__/Welcome.test.tsx`      | 4     | Language selector, submit, error display                                                                            |
| `app/setup/steps/__tests__/Domain.test.tsx`       | 4     | Toggle modes, domain input, IP mode, submit                                                                         |
| `app/setup/steps/__tests__/LLM.test.tsx`          | 4     | Provider selector, test connection, submit                                                                          |
| `app/setup/steps/__tests__/Blog.test.tsx`         | 3     | Live preview, hours->minutes, error display                                                                         |
| `app/setup/steps/__tests__/Telegram.test.tsx`     | 7     | Optional alert, inputs, submit, skip, restore data                                                                  |
| `app/setup/steps/__tests__/Social.test.tsx`       | 4     | Optional alert, toggles, Make download, empty submit                                                                |
| `app/setup/steps/__tests__/Review.test.tsx`       | 3     | Config sections, Edit navigation, key masking                                                                       |
| `app/setup/steps/__tests__/Deploy.test.tsx`       | 7     | Deploy button, progress, checkmarks, error/retry, URLs, dashboard link                                              |
| `app/api/setup/__tests__/apply.test.ts`           | 24    | SSE format, all 12 steps, errors, startFrom, auth, URL generation, managed mode                                     |
| `lib/__tests__/caddy.test.ts`                     | 17    | IP/domain mode, SaaS wildcard cert TLS, custom domains, writeCaddyfile                                              |
| `lib/__tests__/sse.test.ts`                       | 4     | createSSEStream, sendSSEEvent format, closeSSE                                                                      |
| `lib/__tests__/credentials.test.ts`               | 7     | Env var priority, SHA-256 fallback, admin email, all services                                                       |
| `lib/__tests__/i18n.test.ts`                      | 4     | English/Russian locale, all keys, no empty strings                                                                  |
| `lib/__tests__/retry.test.ts`                     | 6     | Success, retry+success, max exceeded, exponential/fixed backoff                                                     |
| `app/api/dashboard/__tests__/status.test.ts`      | 10    | Healthy/unhealthy, Caddy 404, URLs, saas_mode, credentials, auth                                                    |
| `app/api/dashboard/__tests__/stats.test.ts`       | 3     | Article counts, auth, AdapterError                                                                                  |
| `app/api/dashboard/__tests__/reconfigure.test.ts` | 5     | Reset deployed/steps, preserve config, auth                                                                         |
| `app/api/saas/__tests__/health.test.ts`           | 5     | 404 when SaaS off, combined health+stats, adapter failures                                                          |
| `app/dashboard/__tests__/page.test.tsx`           | 12    | Statuses, stats, tools, links, SaaS badge, reconfigure, auto-refresh                                                |

### Integration tests

13 tests across 3 files (require `docker compose -f docker-compose.dev.yml up -d`):

| File                         | Tests | What it verifies                                               |
| ---------------------------- | ----- | -------------------------------------------------------------- |
| `ghost.integration.test.ts`  | 4     | healthCheck, setup, publishPost, getPostUrl against real Ghost |
| `nocodb.integration.test.ts` | 5     | healthCheck, setup, getNextQueued, updateStatus, getStats      |
| `n8n.integration.test.ts`    | 4     | healthCheck, createCredential, importWorkflow, activate        |

---

## Code conventions

- **TypeScript strict**: `strict: true`, no `any`, no `as` assertions
- **Files**: kebab-case (`llm-presets.ts`), PascalCase for components (`Welcome.tsx`)
- **Imports**: `@/*` path alias, no deep relative imports
- **Functions over classes**: factory functions returning plain objects
- **Async/await**: no `.then()` chains
- **ESLint**: `no-explicit-any: error`, `no-unused-vars: error` (`_` prefix allowed), `consistent-type-imports: warn`
- **Prettier**: single quotes, trailing commas, 100 char width, 2-space indent
- **Zod v4**: `z.record(z.string(), valueSchema)`, `error.issues` not `error.errors`

---

## Internationalization (`src/lib/i18n.ts`)

Lightweight i18n, no external libraries. Single file with `en` and `ru` locales.

- `getTranslations(locale?)` -- Returns translations for locale (default: `'en'`).
- `useTranslations()` -- React hook reading locale from `localStorage('language')`.

Covers all wizard steps, common UI strings, dashboard, service descriptions. Dynamic strings use `t.key.replace('{ip}', ...)`. No hardcoded UI strings.

---

## Retry utility (`src/lib/retry.ts`)

```ts
withRetry<T>(fn, options?: { maxRetries?: 3, delayMs?: 1000, backoff?: true })
```

Exponential backoff (`delayMs * 2^attempt`). Used for adapter healthChecks and transient failures.

---

## Accessibility

| Component    | ARIA                                                      |
| ------------ | --------------------------------------------------------- |
| `Stepper`    | `<nav aria-label>`, `<ol>`/`<li>`, `aria-current="step"`  |
| `StepLayout` | `aria-label` on buttons, `aria-busy` during loading       |
| Form steps   | `htmlFor`/`id` pairs, `aria-required`, `aria-describedby` |
| Review       | `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter)      |

---

## CI/CD (`.github/workflows/ci.yml`)

GitHub Actions on push/PR to `main`. Three parallel jobs:

| Job             | Steps                                                |
| --------------- | ---------------------------------------------------- |
| `lint-and-test` | `npm ci` -> `npm run check` -> `npm test --coverage` |
| `docker-build`  | `docker build wizard/` -> `docker compose config`    |
| `shellcheck`    | ShellCheck for `install.sh` and `install-dev.sh`     |

---

## Deploy pipeline (`src/app/api/setup/apply/route.ts`)

12-step SSE pipeline, fully idempotent. Uses `withAuth()` only (not `apiHandler()`) since it returns SSE, not JSON. Each adapter has fast paths for re-deploy. Supports `?startFrom=N` for retry.

### Pipeline steps

| #   | Step               | Action                                                         |
| --- | ------------------ | -------------------------------------------------------------- |
| 1   | Save .env          | Merge config vars (preserves existing adapter keys)            |
| 2   | Generate Caddyfile | IP or domain mode; SaaS adds wildcard cert TLS                 |
| 3   | Check services     | Verify Ghost, NocoDB, n8n healthy                              |
| 4   | Reload Caddy       | Apply Caddyfile via Docker exec                                |
| 5   | Ghost setup        | Admin account + Custom Integration (fast path: verify via JWT) |
| 6   | Upload theme       | Upload openant-source zip (skip if active)                     |
| 7   | Ghost settings     | No-op (configured in step 5)                                   |
| 8   | NocoDB setup       | Admin, base, table, remove defaults, sample row                |
| 9   | n8n setup          | Auto-provision API key (fast path: verify existing)            |
| 10  | n8n credentials    | 2-3 credentials in parallel (LLM, NocoDB, optionally Telegram) |
| 11  | n8n workflows      | Import + activate generate-article + optionally telegram-bot   |
| 12  | Finalize           | Merge adapter keys to .env, set `deployed: true`               |

### Context hydration

Before executing, pipeline reads `.env` and hydrates `DeployContext` + `process.env` with saved adapter keys for fast-path support.

### SSE protocol

- `step` -- `{ step, total, label, status: 'running'|'completed' }`
- `error` -- `{ step, label, error, recoverable: true }`
- `complete` -- `{ success: true, urls: { blog, table, n8n } }`

### DeployContext

Intermediate data (API keys, tokens, credential IDs) flows between steps via local `DeployContext` object -- not persisted to `state.json`.

### Deploy UI (`src/app/setup/steps/Deploy.tsx`)

Uses `fetch` + `ReadableStream.getReader()` for SSE (not `EventSource` -- needs POST/headers). Shows progress bar, step icons, error with retry, success with URLs.

---

## SaaS mode

`OPENANT_SAAS_MODE=true` enables Control Plane integration:

| Feature            | Behavior                                  |
| ------------------ | ----------------------------------------- |
| Domain step        | Skipped (Control Plane manages DNS)       |
| Dashboard badge    | Shows "Managed by openant SaaS"           |
| `/api/saas/health` | Returns combined health + stats (no auth) |
| Reconfigure        | Domain step stays completed               |

Absent or non-`'true'` disables all SaaS features.

### Instance mode (managed vs BYOK)

`INSTANCE_MODE` (`managed`/`byok`, default `byok`). Set by Control Plane via cloud-init (`pro` -> `managed`, `starter` -> `byok`).

| Feature          | BYOK                    | Managed                                   |
| ---------------- | ----------------------- | ----------------------------------------- |
| LLM step         | Shown (user enters key) | Skipped (key pre-injected via cloud-init) |
| n8n Caddy block  | Always included         | Always included                           |
| n8n in dashboard | URL + credentials shown | Hidden from user (admin direct access)    |
| LLM credentials  | From wizard state       | From env vars (`LLM_API_KEY`, etc.)       |

---

## Installation (`install.sh`)

One-command installer. Supports Linux (production) and macOS (local testing with Docker Desktop).

### Prerequisites

- **Linux**: Root, Ubuntu 20.04+/Debian 11+, amd64/arm64, ports 80/443/3000
- **macOS**: Docker Desktop installed and running

### Steps

| #   | Step                 | Action                                                       |
| --- | -------------------- | ------------------------------------------------------------ |
| 1   | `check_root()`       | Verify root (skipped on macOS)                               |
| 2   | `check_os()`         | Detect distro, version, arch                                 |
| 3   | `check_docker()`     | Verify Docker + Compose; install if missing                  |
| 4   | `check_ports()`      | Verify 80/443/3000 available (skipped if containers running) |
| 5   | `setup_directory()`  | `git clone` or tarball to `/opt/openant`                     |
| 6   | `generate_secrets()` | `.env` from `.env.example` with random secrets               |
| 7   | `start_services()`   | `docker compose up -d --build` + healthcheck wait (180s)     |
| 8   | `print_result()`     | Display wizard URL with SETUP_TOKEN                          |

### macOS adaptations

| Area           | Linux                        | macOS                        |
| -------------- | ---------------------------- | ---------------------------- |
| Root check     | Required                     | Skipped                      |
| OS detection   | `/etc/os-release`            | `sw_vers`                    |
| Docker install | `get.docker.com` + systemctl | Error -> link Docker Desktop |
| Port check     | `ss -tlnp`                   | `lsof -iTCP`                 |
| sed in-place   | `sed -i`                     | `sed -i ''`                  |
| Docker GID     | `getent group docker`        | `0`                          |
| Server IP      | `curl ifconfig.me`           | `127.0.0.1`                  |

### Idempotency

Re-running is safe: existing `.env` preserved, code updated via `git pull --ff-only`, running containers detected.

**Uninstall**: `install.sh --uninstall` -- stops containers, removes volumes, deletes `/opt/openant` (with confirmation).

---

## E2E tests (`tests/e2e/run.sh`)

Automated test validating full wizard flow on a deployed instance. Reads `SETUP_TOKEN`/`SERVER_IP` from `/opt/openant/.env`. 9 sequential tests: health, welcome, domain, LLM, blog, social, deploy (SSE), dashboard status/stats. Requires `curl`, `jq`. Designed for fresh installations.

---

## What's next

- Production hardening
- E2E test automation in CI
- Additional locales
