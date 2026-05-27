#!/usr/bin/env bash
# Idempotent setup for atlassian-local-mcp on macOS/Linux.
# Safe to run multiple times.
#
# Usage: ./setup/setup.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${CYAN}=== atlassian-local-mcp setup ===${NC}"

# ── 1. Check Node.js ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install it from https://nodejs.org (>= 18) and re-run."
  exit 1
fi
NODE_VERSION=$(node --version)
echo "[OK] Node.js $NODE_VERSION"

# ── 2. Install dependencies ─────────────────────────────────────────────────────
echo ""
echo "[1/4] Installing npm dependencies..."
cd "$REPO_ROOT" && npm install --silent
echo "[OK] Dependencies installed"

# ── 3. Create .env from example ─────────────────────────────────────────────────
ENV_FILE="$REPO_ROOT/.env"
ENV_EXAMPLE="$REPO_ROOT/.env.example"

if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "[2/4] Creating .env from .env.example..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "[OK] .env created"
  echo "     Fill in your credentials:"
  echo "       JIRA_HOST, JIRA_EMAIL, JIRA_TOKEN, BITBUCKET_WORKSPACE"
  echo ""
  echo "     Opening in your default editor (or edit manually: $ENV_FILE)"
  "${EDITOR:-vi}" "$ENV_FILE"
else
  echo "[OK] .env already exists — skipping"
fi

# ── 4. Add ATLASSIAN_MCP_DIR to shell profile ───────────────────────────────────
echo ""
echo "[3/4] Checking shell profile..."

PROFILE_FILE=""
if [ -f "$HOME/.zshrc" ]; then
  PROFILE_FILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  PROFILE_FILE="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  PROFILE_FILE="$HOME/.bash_profile"
fi

EXPORT_LINE="export ATLASSIAN_MCP_DIR=\"$REPO_ROOT\""

if [ -n "$PROFILE_FILE" ] && ! grep -q "ATLASSIAN_MCP_DIR" "$PROFILE_FILE" 2>/dev/null; then
  echo "" >> "$PROFILE_FILE"
  echo "# atlassian-local-mcp" >> "$PROFILE_FILE"
  echo "$EXPORT_LINE" >> "$PROFILE_FILE"
  echo "export PATH=\"\$PATH:\$ATLASSIAN_MCP_DIR\"" >> "$PROFILE_FILE"
  echo "[OK] Added ATLASSIAN_MCP_DIR to $PROFILE_FILE (restart shell to take effect)"
else
  echo "[OK] Already configured or profile not found — skipping"
fi

# ── 5. Make inject script executable ────────────────────────────────────────────
echo ""
echo "[4/4] Making scripts executable..."
chmod +x "$REPO_ROOT/setup/inject-agents.sh"
echo "[OK] Done"

echo -e "\n${GREEN}=== Setup complete! ===${NC}"
echo "To start the MCP server:"
echo "  cd $REPO_ROOT && npm start"
echo ""
echo "To inject agents.md into a repo:"
echo "  ./setup/inject-agents.sh /path/to/your-repo"
