# atlassian-local-mcp

Local MCP server exposing **52 tools** (Jira, Confluence, Bitbucket + agent context) as a JSON-RPC 2.0 HTTP endpoint.  
Designed for AI coding agents (GitHub Copilot, Cursor, Windsurf, etc.) running in **any repo** on a developer's machine.

> **This is an unofficial team tool.** Nothing gets committed to your working repos.  
> Everything the MCP creates lives in `.agents/` which is excluded from git locally.

---

## How it works (two separate repos)

```
┌─────────────────────────────────────────────────────┐
│  YOUR MACHINE                                       │
│                                                     │
│  ~/Documents/atlassian-local-mcp/   ← THIS REPO    │
│    └─ npm start → serves on :3847                   │
│                                                     │
│  ~/work/pro-ms-earnbacks/           ← WORKING REPO │
│    └─ .agents/          ← local-only, never pushed  │
│         ├─ agents.md    ← workflow instructions     │
│         └─ RWD-1234.md  ← ticket context (cache)   │
└─────────────────────────────────────────────────────┘
```

The MCP repo is a **background service**. Your working repo is where you code. They never touch each other's git history.

---

## Setup (one-time, ~2 minutes)

```bash
# 1. Clone this tool anywhere you want
git clone git@github.com:rafaelUribe/atlassian-local-mcp.git
cd atlassian-local-mcp

# 2. Install (auto-creates .env from template)
npm install

# 3. Fill in your Atlassian credentials
#    (see "Credentials setup" section below)
code .env   # or notepad, vim, whatever

# 4. Start the server (leave this terminal open)
npm start
```

That's it. The server runs on `http://localhost:3847/`. No PATH changes, no env vars injected, no system modifications.

---

## Connecting your AI agent to the MCP

Point your AI tool's MCP configuration to `http://localhost:3847/`. Examples:

**VS Code (`.vscode/mcp.json` in your working repo):**
```json
{
  "servers": {
    "atlassian": {
      "type": "http",
      "url": "http://localhost:3847/"
    }
  }
}
```

> This file can be committed (it's just a URL, no secrets) or excluded — your choice.

**Cursor / Windsurf:** Add the URL in Settings → MCP Servers.

---

## How agents get their instructions

The AI agent calls `mcp_get_agent_context` at session start. This returns workflow instructions that tell it how to:
- Initialize tickets (fetch from Jira, cache locally)
- Create `.agents/` and exclude it from git automatically (Step 0 — idempotent)
- Ask confirmation before git operations
- Document in Confluence safely

```bash
# Test it manually:
curl -s -X POST http://localhost:3847/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp_get_agent_context","arguments":{}}}' \
  | jq -r '.result.content[0].text'
```

---

## Alternative: manual file import (no MCP connection needed)

If you can't or don't want to configure the MCP in your editor, download the template directly:

```bash
# From the root of your WORKING repo (not this one)
mkdir -p .agents
curl -sL https://raw.githubusercontent.com/rafaelUribe/atlassian-local-mcp/main/agents/agents-template.md \
  -o .agents/agents.md
echo '.agents/' >> .git/info/exclude
```

```powershell
# Windows (PowerShell) — from the root of your WORKING repo
New-Item -ItemType Directory -Force -Path .agents | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/rafaelUribe/atlassian-local-mcp/main/agents/agents-template.md" `
  -OutFile ".agents\agents.md"
Add-Content .git\info\exclude ".agents/"
```

The file contains the same instructions returned by `mcp_get_agent_context`. Both options are equivalent.

---

## What NEVER gets committed to your working repo

| Item | Where it lives | Why it's safe |
|---|---|---|
| `.agents/` folder | Your working repo (local) | Added to `.git/info/exclude` — invisible to git |
| `.env` | This MCP repo only | Contains your token, never leaves this directory |
| `mcp.info` | This MCP repo only | Runtime file, auto-excluded |

`.git/info/exclude` is a **local-only** git mechanism (like `.gitignore` but never committed). Your teammates won't see it, your PRs won't include it.

---

## Tools (52 total)

| Category | Count | Example tools |
|---|---|---|
| Jira | 20 | `jira_get_ticket`, `jira_search_tickets`, `jira_create_ticket`, `jira_get_sprint_tickets` |
| Confluence | 14 | `confluence_search`, `confluence_get_page`, `confluence_create_page`, `confluence_update_page` |
| Bitbucket | 17 | `bitbucket_get_pull_requests`, `bitbucket_create_pull_request`, `bitbucket_get_diff`, `bitbucket_get_file` |
| Meta | 1 | `mcp_get_agent_context` |

List all tools at runtime:

```powershell
$r = Invoke-RestMethod http://localhost:3847/ -Method Post -ContentType application/json `
     -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
$r.result.tools.name
```

```bash
curl -s -X POST http://localhost:3847/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[].name'
```

---

## Agent workflow summary

When an agent receives the template (via `mcp_get_agent_context` or from `.agents/agents.md`), it follows this flow:

| Step | What happens | Idempotent? |
|---|---|---|
| **0 — Self-Setup** | Creates `.agents/` + adds entries to `.git/info/exclude` | ✓ (skips if exists) |
| **1 — Cache check** | Looks for `.agents/[TICKET].md` before calling APIs | ✓ |
| **2 — Jira fetch** | Gets ticket data (AC, description, priority) | Only if cache miss |
| **3 — Context file** | Creates `.agents/[TICKET].md` with structured data | Only once per ticket |
| **4 — Git ops** | **Asks confirmation first**, then pull + branch | User controls |
| **5 — Work plan** | Analyzes code, proposes plan | Only for new tickets |

Nothing in this flow commits to your repo or pushes to remote without your explicit `y`.

---

## Confluence documentation wrapper

```bash
# Run from the atlassian-local-mcp directory
node confluence-doc.js --topic "My Topic" --space "ENG" [--parentId 12345]
```

Automates the search → read → propose → confirm → create flow in a single CLI command.

---

## Requirements

- Node.js >= 18
- Atlassian Cloud account with API token

---

## Credentials setup

Each developer needs a personal Atlassian API token. One-time setup:

### 1. Generate your API token

1. Go to: **https://id.atlassian.com/manage-profile/security/api-tokens**
2. Click **"Create API token"** → name it (e.g. `mcp-local`) → **Create**.
3. Copy the token immediately (it won't be shown again).

### 2. Fill in `.env`

After `npm install`, a `.env` file is created automatically. Edit it:

```env
JIRA_HOST=<your-domain>.atlassian.net
JIRA_EMAIL=your.name@company.com
JIRA_TOKEN=<paste your API token here>
BITBUCKET_WORKSPACE=<your-bitbucket-workspace-slug>
HTTP_PORT=3847
HTTP_BIND=0.0.0.0
```

| Variable | Where to find it |
|---|---|
| `JIRA_HOST` | Your Atlassian URL without `https://` — e.g. `acme.atlassian.net` |
| `JIRA_EMAIL` | The email you log into Atlassian with |
| `JIRA_TOKEN` | The API token from step 1 |
| `BITBUCKET_WORKSPACE` | The slug in your Bitbucket URL: `bitbucket.org/<this-part>` |

### 3. Start

```bash
npm start
```

---

## FAQ

**Q: Does this modify my working repo in any way that's visible to git?**  
A: No. `.agents/` is excluded via `.git/info/exclude` which is local-only and never committed.

**Q: Can my teammates see that I'm using this?**  
A: No. Unless you choose to commit `.vscode/mcp.json` (which is just a URL, no secrets).

**Q: What if I re-clone my working repo?**  
A: The agent will re-run Step 0 automatically on the next session and recreate `.agents/` + the exclude entry.

**Q: Do I need to keep a terminal open?**  
A: Yes, the MCP server needs to be running. You can also run it as a background process or service.

If you see `Atlassian MCP HTTP server listening on http://localhost:3847/` — you're done.
