#!/usr/bin/env bash
set -euo pipefail

# ── Dev installer: copies from current directory to a temp folder ───────────
# Usage: ./install-dev.sh
# Cleanup: ./install-dev.sh --uninstall

# ── Colors and formatting ────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Constants ────────────────────────────────────────────────────────────────

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="${OPENANT_DEV_DIR:-/tmp/openant-dev}"
OS_TYPE=$(uname -s) # "Darwin" or "Linux"

# ── Helpers ──────────────────────────────────────────────────────────────────

version_ge() {
  local sorted
  sorted=$(printf '%s\n%s' "$2" "$1" | sort -V | head -n1)
  [[ "$sorted" == "$2" ]]
}

sed_inplace() {
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# ── Step 1: Check root ──────────────────────────────────────────────────────

check_root() {
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    info "macOS detected. Skipping root check (Docker Desktop runs as user)."
    return 0
  fi
  if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root or with sudo"
    exit 1
  fi
}

# ── Step 2: Check OS and architecture ───────────────────────────────────────

check_os() {
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    local macos_version
    macos_version=$(sw_vers -productVersion)
    local arch
    arch=$(uname -m)
    if [[ "$arch" != "x86_64" && "$arch" != "arm64" ]]; then
      error "Unsupported architecture: $arch"
      exit 1
    fi
    info "OS: macOS $macos_version ($arch)"
    return 0
  fi

  if [[ ! -f /etc/os-release ]]; then
    error "Cannot detect OS. /etc/os-release not found."
    exit 1
  fi

  # shellcheck source=/dev/null
  source /etc/os-release
  local distro="${ID:-unknown}"
  local version="${VERSION_ID:-0}"

  case "$distro" in
    ubuntu)
      if ! version_ge "$version" "20.04"; then
        warn "Ubuntu $version detected. Minimum recommended: 20.04"
      fi
      ;;
    debian)
      if ! version_ge "$version" "11"; then
        warn "Debian $version detected. Minimum recommended: 11"
      fi
      ;;
    centos|rhel|rocky|almalinux)
      warn "$distro $version detected. Best-effort support."
      ;;
    *)
      warn "Unsupported OS: $distro $version. Proceeding at your own risk."
      ;;
  esac

  local arch
  arch=$(uname -m)
  if [[ "$arch" != "x86_64" && "$arch" != "aarch64" && "$arch" != "arm64" ]]; then
    error "Unsupported architecture: $arch. Only amd64 (x86_64) and arm64 (aarch64) are supported."
    exit 1
  fi

  info "OS: $distro $version ($arch)"
}

# ── Step 3: Check / install Docker ──────────────────────────────────────────

install_docker() {
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    error "Docker Desktop is required on macOS."
    error "Install it from https://www.docker.com/products/docker-desktop/"
    exit 1
  fi

  curl -fsSL https://get.docker.com | bash
  systemctl enable docker
  systemctl start docker
  info "Docker installed successfully"

  if ! docker compose version &>/dev/null; then
    error "Docker Compose plugin was not installed automatically."
    error "Install it manually: apt-get install -y docker-compose-plugin"
    exit 1
  fi
}

check_docker() {
  if command -v docker &>/dev/null; then
    local docker_version
    docker_version=$(docker version --format '{{.Server.Version}}' 2>/dev/null || docker --version | sed 's/Docker version \([0-9.]*\).*/\1/')
    info "Docker found: version $docker_version"

    if docker compose version &>/dev/null; then
      info "Docker Compose plugin found"
    else
      error "Docker Compose plugin not found."
      if [[ "$OS_TYPE" == "Darwin" ]]; then
        error "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
      else
        error "Install it: apt-get install -y docker-compose-plugin"
      fi
      exit 1
    fi
  else
    info "Docker not found. Installing..."
    install_docker
  fi
}

# ── Step 4: Check ports ─────────────────────────────────────────────────────

check_ports() {
  # Skip port check if openant is already running
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^openant-"; then
    info "openant containers already running. Skipping port check."
    return 0
  fi

  local ports=(80 443 3000)
  local blocked=false

  for port in "${ports[@]}"; do
    if [[ "$OS_TYPE" == "Darwin" ]]; then
      if lsof -iTCP:"${port}" -sTCP:LISTEN -P -n 2>/dev/null | grep -q LISTEN; then
        error "Port $port is already in use"
        blocked=true
      fi
    else
      if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
        error "Port $port is already in use"
        blocked=true
      fi
    fi
  done

  if [[ "$blocked" == "true" ]]; then
    error "Free the ports listed above and try again."
    exit 1
  fi

  info "Ports 80, 443, 3000 are available"
}

# ── Step 5: Set up directory (DEV: copy from source) ─────────────────────

setup_directory() {
  if [[ -d "$INSTALL_DIR" ]] && [[ -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
    info "Existing dev installation found at $INSTALL_DIR. Updating files..."
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='.env' "$SOURCE_DIR/" "$INSTALL_DIR/"
  else
    info "Copying project files from $SOURCE_DIR..."
    mkdir -p "$INSTALL_DIR"
    rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='.env' "$SOURCE_DIR/" "$INSTALL_DIR/"
  fi

  info "Files installed to $INSTALL_DIR"
}

# ── Step 6: Generate secrets ────────────────────────────────────────────────

generate_secrets() {
  local env_file="${INSTALL_DIR}/.env"
  local env_example="${INSTALL_DIR}/.env.example"

  if [[ -f "$env_file" ]]; then
    warn ".env already exists. Keeping existing configuration."
    return 0
  fi

  if [[ ! -f "$env_example" ]]; then
    error ".env.example not found at $env_example"
    exit 1
  fi

  info "Generating secrets..."

  cp "$env_example" "$env_file"

  local setup_token
  setup_token=$(openssl rand -hex 16)
  local nocodb_jwt_secret
  nocodb_jwt_secret=$(openssl rand -hex 32)
  local db_password
  db_password=$(openssl rand -hex 16)
  local ghost_db_password
  ghost_db_password=$(openssl rand -hex 16)
  local ghost_db_root_password
  ghost_db_root_password=$(openssl rand -hex 16)

  local server_ip
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    server_ip="127.0.0.1"
  else
    server_ip=$(curl -s --connect-timeout 5 https://api.ipify.org || curl -s --connect-timeout 5 https://ifconfig.me || echo "127.0.0.1")
  fi

  local docker_gid
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    docker_gid="0"
  else
    docker_gid=$(getent group docker 2>/dev/null | cut -d: -f3 || echo "999")
  fi

  sed_inplace "s|^SETUP_TOKEN=.*|SETUP_TOKEN=${setup_token}|" "$env_file"
  sed_inplace "s|^SERVER_IP=.*|SERVER_IP=${server_ip}|" "$env_file"
  sed_inplace "s|^GHOST_URL=.*|GHOST_URL=http://${server_ip}|" "$env_file"
  sed_inplace "s|^DOCKER_GID=.*|DOCKER_GID=${docker_gid}|" "$env_file"
  sed_inplace "s|^DB_PASSWORD=.*|DB_PASSWORD=${db_password}|" "$env_file"
  sed_inplace "s|^NOCODB_JWT_SECRET=.*|NOCODB_JWT_SECRET=${nocodb_jwt_secret}|" "$env_file"
  sed_inplace "s|^GHOST_DB_PASSWORD=.*|GHOST_DB_PASSWORD=${ghost_db_password}|" "$env_file"
  sed_inplace "s|^GHOST_DB_ROOT_PASSWORD=.*|GHOST_DB_ROOT_PASSWORD=${ghost_db_root_password}|" "$env_file"

  info "Secrets generated and saved to .env"
}

# ── Step 7: Start services ──────────────────────────────────────────────────

wait_for_healthy() {
  local timeout=180
  local elapsed=0
  local interval=5

  local health_services=("openant-wizard" "openant-ghost" "openant-ghost-db" "openant-nocodb" "openant-db" "openant-n8n")

  while [[ $elapsed -lt $timeout ]]; do
    local all_healthy=true

    for service in "${health_services[@]}"; do
      local status
      status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$service" 2>/dev/null || echo "missing")
      if [[ "$status" != "healthy" ]]; then
        all_healthy=false
        break
      fi
    done

    if [[ "$all_healthy" == "true" ]]; then
      local caddy_state
      caddy_state=$(docker inspect --format='{{.State.Status}}' "openant-caddy" 2>/dev/null || echo "missing")
      if [[ "$caddy_state" == "running" ]]; then
        echo ""
        info "All services are healthy!"
        return 0
      fi
    fi

    sleep "$interval"
    elapsed=$((elapsed + interval))
    printf "."
  done

  printf "\n"
  warn "Some services did not become healthy within ${timeout}s"
  warn "Current status:"
  for service in "${health_services[@]}" "openant-caddy"; do
    local status
    status=$(docker inspect --format='{{.State.Status}} {{if .State.Health}}(health: {{.State.Health.Status}}){{end}}' "$service" 2>/dev/null || echo "not found")
    echo "  $service: $status"
  done
  warn "Check logs: cd $INSTALL_DIR && docker compose logs"
  return 1
}

start_services() {
  info "Starting openant services..."
  cd "$INSTALL_DIR"
  docker compose pull 2>/dev/null || true
  docker compose up -d --build

  info "Waiting for services to become healthy..."
  wait_for_healthy
}

# ── Step 8: Print result ────────────────────────────────────────────────────

print_result() {
  local setup_token
  setup_token=$(grep '^SETUP_TOKEN=' "${INSTALL_DIR}/.env" | cut -d= -f2)
  local server_ip
  server_ip=$(grep '^SERVER_IP=' "${INSTALL_DIR}/.env" | cut -d= -f2)

  echo ""
  echo "============================================"
  echo -e "${GREEN}  openant (dev) installed successfully!${NC}"
  echo "============================================"
  echo ""
  echo "  Install dir: $INSTALL_DIR"
  echo ""
  echo "  Open in browser:"
  echo -e "  ${BLUE}http://${server_ip}:3000?token=${setup_token}${NC}"
  echo ""
  echo -e "  ${YELLOW}NOTE: Connection is not encrypted.${NC}"
  echo "  Set up a domain in the Wizard to enable HTTPS."
  echo ""
  echo "  Useful commands:"
  echo "    cd $INSTALL_DIR"
  echo "    docker compose logs -f          # View logs"
  echo "    docker compose restart           # Restart all"
  echo "    docker compose down              # Stop all"
  echo ""
  echo "  Cleanup:"
  echo "    $SOURCE_DIR/install-dev.sh --uninstall"
  echo ""

  # Open wizard in browser
  local url="http://${server_ip}:3000?token=${setup_token}"
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    open "$url" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url" 2>/dev/null || true
  fi
}

# ── Uninstall ────────────────────────────────────────────────────────────────

uninstall() {
  echo ""
  warn "This will remove the dev installation at $INSTALL_DIR"
  echo ""
  read -rp "Are you sure? Type 'yes' to confirm: " confirm

  if [[ "$confirm" != "yes" ]]; then
    info "Uninstall cancelled."
    exit 0
  fi

  if [[ -f "${INSTALL_DIR}/docker-compose.yml" ]]; then
    info "Stopping and removing containers and volumes..."
    docker compose -f "${INSTALL_DIR}/docker-compose.yml" down -v 2>/dev/null || true
  fi

  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    info "Removed $INSTALL_DIR"
  fi

  info "Dev installation has been completely removed."
}

# ── Argument parsing ─────────────────────────────────────────────────────────

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "=============================="
  echo "   openant installer (dev)"
  echo "=============================="
  echo ""
  echo "  Source: $SOURCE_DIR"
  echo "  Target: $INSTALL_DIR"
  echo ""

  check_root
  check_os
  check_docker
  check_ports
  setup_directory
  generate_secrets
  start_services
  print_result
}

main "$@"
