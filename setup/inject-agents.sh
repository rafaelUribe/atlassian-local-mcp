#!/usr/bin/env bash
# Injects agents.md into a target Git repo and adds it to git exclude.
# Idempotent — safe to run multiple times.
#
# Usage: ./setup/inject-agents.sh /path/to/your-repo
#        ./setup/inject-agents.sh .   (current directory)

set -e

REPO_PATH="${1:-.}"
REPO_PATH="$(cd "$REPO_PATH" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$REPO_ROOT/agents/agents-template.md"
AGENTS_DIR="$REPO_PATH/.agents"
AGENTS_FILE="$AGENTS_DIR/agents.md"
GIT_EXCLUDE="$REPO_PATH/.git/info/exclude"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "\n${CYAN}=== inject-agents ===${NC}"
echo "Target repo : $REPO_PATH"

# ── Validate target is a git repo ───────────────────────────────────────────────
if [ ! -d "$REPO_PATH/.git" ]; then
  echo "ERROR: Not a git repository: $REPO_PATH"
  exit 1
fi

# ── Create .agents/ dir ─────────────────────────────────────────────────────────
mkdir -p "$AGENTS_DIR"

# ── Copy agents-template.md → .agents/agents.md ─────────────────────────────────
if [ ! -f "$AGENTS_FILE" ]; then
  cp "$TEMPLATE" "$AGENTS_FILE"
  echo "[OK] Created .agents/agents.md"
else
  echo "[--] .agents/agents.md already exists — skipping"
fi

# ── Add entries to .git/info/exclude ────────────────────────────────────────────
mkdir -p "$REPO_PATH/.git/info"
touch "$GIT_EXCLUDE"

ENTRIES=(".agents/agents.md" ".agents/" ".env" "mcp.info")

for entry in "${ENTRIES[@]}"; do
  if ! grep -qF "$entry" "$GIT_EXCLUDE" 2>/dev/null; then
    echo "$entry" >> "$GIT_EXCLUDE"
    echo "[OK] Added to git exclude: $entry"
  else
    echo "[--] Already in git exclude: $entry"
  fi
done

echo -e "\n${GREEN}=== Done! ===${NC}"
echo ".agents/agents.md is local-only and will NOT be committed."
echo ""
echo "Start the MCP server before using AI agents:"
echo "  cd $REPO_ROOT && npm start"
