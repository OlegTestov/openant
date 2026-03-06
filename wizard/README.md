# openant Wizard

Next.js application that serves as the Setup Wizard and Dashboard for the openant platform.

## Development

```bash
# Install dependencies
npm install

# Start dev server (requires infra services running via docker-compose.dev.yml)
npm run dev

# Run unit tests
npm test

# Run tests with coverage
npm test -- --coverage

# Type checking + lint + format check
npm run check

# Build for production
npm run build
```

## Project structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Root redirect (→ /setup or /dashboard)
│   ├── api/setup/          # Wizard step API routes + deploy SSE endpoint
│   ├── api/dashboard/      # Dashboard API routes (status, stats, reconfigure)
│   ├── api/saas/           # SaaS health endpoint
│   ├── dashboard/          # Dashboard page
│   └── setup/              # Wizard page + step components
├── components/             # Reusable React components
├── lib/                    # Business logic
│   ├── adapters/           # Service adapters (Ghost, NocoDB, n8n)
│   │   ├── types.ts        # Adapter interfaces (central contract)
│   │   ├── index.ts        # Adapter registry
│   │   ├── ghost.ts        # Ghost BlogAdapter
│   │   ├── nocodb.ts       # NocoDB TableAdapter (incl. Prompts table)
│   │   ├── n8n.ts          # n8n AutomationAdapter
│   │   ├── __mocks__/      # Mock adapters for testing
│   │   └── __tests__/      # Adapter unit tests
│   ├── caddy.ts            # Caddyfile generation
│   ├── docker.ts           # Docker service management
│   ├── state.ts            # state.json read/write
│   ├── config.ts           # .env read/write
│   ├── auth.ts             # Bearer token auth middleware
│   └── sse.ts              # Server-Sent Events utilities
└── types/                  # Shared TypeScript types
```

## Testing

350+ unit tests covering all adapters, API routes, and utilities. Tests use `vitest` with `jsdom` environment and mock `fetch` for HTTP interactions.

```bash
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm test -- --coverage      # Coverage report
```

## Adapters

The adapter system is the core architectural pattern. Each external service (Ghost, NocoDB, n8n) communicates through a TypeScript interface. See `src/lib/adapters/types.ts` for contracts.

Key features:
- **System/user prompt split**: NocoDB stores detailed system prompts. The n8n workflow sends them as `system` role messages, with dynamic data (topic, description) as `user` role.
- **Image generation**: The n8n workflow generates cover images via LLM (`modalities: ['text', 'image']`) and uploads them to Ghost.
- **Language/tone baking**: `{language}` and `{tone}` placeholders in prompt templates are substituted once at deploy time and stored in NocoDB.
