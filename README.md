# openant

Self-hosted platform that automatically generates SEO articles from your topics, publishes them to a blog, and promotes them on social media.

One command to install. A visual wizard to configure. Zero coding required.

## How it works

```
You add topics to a spreadsheet
        |
AI generates a full SEO article + cover image for each topic
        |
Article with image is published to your blog
        |
Pin / post is created on Pinterest & Threads
        |
Visitors read the article and follow your link
```

Everything runs on your own server. You control the data.

## Features

- **One-command install** -- single `curl | bash` sets up everything on a fresh server
- **Visual setup wizard** -- step-by-step configuration, no terminal needed after install
- **AI-powered writing** -- works with OpenAI, DeepSeek, OpenRouter, or any OpenAI-compatible API
- **AI cover images** -- automatic blog cover image generation via LLM image models (e.g. Gemini)
- **Auto-publishing** -- articles are published to a Ghost blog on a schedule you set
- **Social promotion** -- automatic Pinterest pins and Threads posts via Make.com
- **Topic queue** -- add 50 topics at once, the system processes them one by one (FIFO)
- **Self-hosted** -- all data stays on your server, no third-party accounts except the LLM API
- **Dark mode** -- toggle dark/light mode from the header; persists across page loads, defaults to system preference
- **Domain + HTTPS** -- optional custom domain with automatic SSL certificates
- **SaaS-ready** -- supports managed mode (`INSTANCE_MODE=managed`) where LLM key is pre-injected and n8n is hidden from the user

## Quick start

### 1. Install (5 minutes)

SSH into your server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/openant/main/install.sh | sudo bash
```

The script will:
- Install Docker if needed
- Download openant
- Generate secure passwords
- Start all services

At the end you'll see:

```
openant installed successfully!

Open in browser:
http://<your-server-ip>:3000?token=<your-token>
```

### 2. Configure (10 minutes)

Open the URL from step 1 in your browser. The wizard will guide you through:

| Step | What you do |
|------|-------------|
| **Welcome** | Choose your language |
| **Domain** | Enter your domain or continue with IP address |
| **LLM** | Paste your OpenAI (or compatible) API key |
| **Blog** | Set your blog name, language, and tone |
| **Social** | Add a Make.com webhook URL (optional) |
| **Review** | Check everything looks right |
| **Deploy** | Click deploy and watch the progress bar |

### 3. Add topics

Open the NocoDB table (link shown after deploy) and start adding rows:

| Topic | Description | Link |
|-------|-------------|------|
| 10 ways to boost sales | Focus on e-commerce | https://yoursite.com |
| How to choose a CRM | Compare top 5 options | https://yoursite.com |

Rows with empty status are picked up automatically. The system processes them one by one on schedule.

## Server requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Ubuntu 20.04+ or Debian 11+ |
| Architecture | amd64 or arm64 |
| RAM | 2 GB |
| Disk | 20 GB |
| Ports | 80, 443, 3000 |
| Access | Root (sudo) |

CentOS and RHEL are supported on a best-effort basis.

For **local testing on macOS**, the installer works with Docker Desktop (no root required).

## Local development

The easiest way to run locally is with the dev installer:

```bash
bash install-dev.sh
```

This copies the project to `/tmp/openant-dev`, generates secrets, builds and starts all containers. The wizard opens at `http://127.0.0.1:3000`.

For development with hot-reload, start only the infrastructure:

```bash
docker compose -f docker-compose.dev.yml up -d
cd wizard && npm install && npm run dev
```

NocoDB is at `localhost:8080`, n8n at `localhost:5678`. Ghost is behind Caddy at `localhost:80`.

### Environment variables (SaaS mode)

When provisioned by the SaaS Control Plane, these additional env vars are set via cloud-init:

| Variable | Description |
|----------|-------------|
| `INSTANCE_MODE` | `managed` (LLM pre-injected, n8n hidden) or `byok` (default, user brings own key) |
| `GHOST_ADMIN_PASSWORD` | Random admin password for Ghost |
| `NOCODB_ADMIN_PASSWORD` | Random admin password for NocoDB |
| `N8N_ADMIN_PASSWORD` | Random admin password for n8n |

### Useful commands

```bash
# View logs
docker compose logs -f

# Restart all services
docker compose restart

# Stop everything
docker compose down

# Stop and delete all data
docker compose down -v

# Run unit tests
cd wizard && npm test

# Run type checking + lint + format check
cd wizard && npm run check

# Build for production
cd wizard && npm run build
```

## Uninstall

```bash
sudo bash /opt/openant/install.sh --uninstall
```

This stops all containers, removes volumes, and deletes `/opt/openant`. You will be asked to confirm.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed overview of the system design, adapter pattern, deploy pipeline, and all API endpoints.

## Tech stack

| Component | Technology |
|-----------|------------|
| Wizard | Next.js, TypeScript, Tailwind CSS |
| Blog | Ghost |
| Topic queue | NocoDB |
| Automation | n8n |
| Reverse proxy | Caddy (auto-HTTPS) |
| Databases | PostgreSQL, MySQL |
| Containers | Docker Compose |

## License

MIT
