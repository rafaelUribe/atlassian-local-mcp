# atlassian-local-mcp

Local MCP server that exposes **51 tools** for Jira, Confluence and Bitbucket as a JSON-RPC 2.0 HTTP endpoint.
Designed to be consumed by AI agents (GitHub Copilot, Cursor, etc.) running inside any repo on your machine.

---

## Quick start

```bash
git clone git@github.com:rafaelUribe/atlassian-local-mcp.git
cd atlassian-local-mcp
npm install
cp .env.example .env   # fill in your credentials
npm start
```

The server starts on `http://localhost:3847/` and writes `mcp.info` so other scripts can discover the URL.

---

## Team setup (idempotent)

### Windows (PowerShell)

```powershell
# Run once per machine — safe to re-run
.\setup\setup.ps1
```

The script:
1. Installs `npm` dependencies.
2. Creates `.env` from `.env.example` if it does not exist (then opens it for editing).
3. Adds `ATLASSIAN_MCP_DIR` to your user `PATH` environment so helpers are always reachable.
4. Writes a `start-mcp.bat` shortcut next to the repo root for quick launching.

### macOS / Linux (bash)

```bash
chmod +x setup/setup.sh
./setup/setup.sh
```

---

## Injecting `agents.md` into your repos (idempotent)

The `agents-template.md` contains the workflow instructions that AI agents need to use this MCP correctly.
You can inject it into any Git repo on your machine without committing it:

### Windows

```powershell
.\setup\inject-agents.ps1 -RepoPath C:\path\to\your-repo
```

### macOS / Linux

```bash
./setup/inject-agents.sh /path/to/your-repo
```

What the inject script does:
- Creates `.agents/agents.md` inside the target repo (from `agents/agents-template.md`).
- Adds `.agents/agents.md`, `.env` and `mcp.info` to the repo's `.git/info/exclude` (local-only gitignore, never committed).
- Safe to run multiple times — skips if already present.

---

## Tools (51 total)

| Category | Count | Example tools |
|---|---|---|
| Jira | 20 | `jira_get_ticket`, `jira_search_tickets`, `jira_create_ticket`, `jira_get_sprint_tickets` |
| Confluence | 14 | `confluence_search`, `confluence_get_page`, `confluence_create_page`, `confluence_update_page` |
| Bitbucket | 17 | `bitbucket_get_pull_requests`, `bitbucket_create_pull_request`, `bitbucket_get_diff`, `bitbucket_get_file` |

To list all tools at runtime:

```powershell
$r = Invoke-RestMethod http://localhost:3847/ -Method Post -ContentType application/json `
     -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
$r.result.tools.name
```

Or:

```bash
curl -s -X POST http://localhost:3847/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[].name'
```

---

## URL discovery from other scripts

```js
const info = JSON.parse(fs.readFileSync('path/to/mcp.info', 'utf8'));
// or: process.env.ATLASSIAN_MCP_URL || 'http://localhost:3847/'
```

```powershell
node path/to/atlassian-local-mcp/read-mcp.js   # prints URL
node path/to/atlassian-local-mcp/read-mcp.js --json  # prints full JSON
```

---

## Agents.md workflow

See [`agents/agents-template.md`](agents/agents-template.md) for the full instructions that should live in each repo.

Key conventions enforced by the template:

1. **Cache-first ticket init** — reads `.agents/[TICKET_ID].md` before calling Jira.
2. **Clean Confluence docs** — search → read 2 pages → propose → confirm → create.
3. **Progress logging** — `git diff`-based devlog appended to `.agents/[TICKET_ID].md`.
4. **Git exclude** — `agents.md`, `.env` and `mcp.info` are never committed.

---

## Confluence documentation wrapper

```bash
node confluence-doc.js --topic "My Topic" --space "ENG" [--parentId 12345]
```

Automates: CQL search → read top pages → print proposal → wait for confirmation → create.

---

## Requirements

- Node.js >= 18
- Atlassian account with API token ([generate here](https://id.atlassian.com/manage-profile/security/api-tokens))
- Bitbucket App Password or API token with read/write scopes
