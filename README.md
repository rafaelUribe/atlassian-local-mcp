# atlassian-local-mcp

Local MCP server exposing **52 tools** for Jira, Confluence, Bitbucket and agent context as a JSON-RPC 2.0 HTTP endpoint.  
Designed for AI coding agents (GitHub Copilot, Cursor, Windsurf, etc.) to consume from any repository on a developer's machine.

---

## Quick start

```bash
git clone git@github.com:rafaelUribe/atlassian-local-mcp.git
cd atlassian-local-mcp
npm install          # creates .env automatically + configures git exclude
# edit .env with your credentials
npm start
```

The server starts on `http://localhost:3847/` and writes a `mcp.info` file for programmatic URL discovery.

---

## How agents get context

The server includes a tool called **`mcp_get_agent_context`**. An AI agent calls it at session start to receive the full set of workflow instructions (Confluence docs workflow, ticket initialization, progress logging, git conventions) — no files need to be copied into the target repo.

```bash
curl -s -X POST http://localhost:3847/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp_get_agent_context","arguments":{}}}' \
  | jq -r '.result.content[0].text'
```

**Setup for each developer:**
1. Clone this repo and run `npm install`.
2. Fill in `.env` with personal Atlassian credentials.
3. Start the server (`npm start`).
4. Point the AI agent to `http://localhost:3847/` (or read the URL from `mcp.info`).

No scripts modify the system PATH, environment variables, or other repositories. Each developer's repos remain untouched.

---

## Alternative: manual file import

If you prefer a static file over the HTTP tool, download the template directly into your working repo:

```bash
# From the root of your project repo
mkdir -p .agents
curl -sL https://raw.githubusercontent.com/rafaelUribe/atlassian-local-mcp/main/agents/agents-template.md \
  -o .agents/agents.md
```

```powershell
# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path .agents
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/rafaelUribe/atlassian-local-mcp/main/agents/agents-template.md" `
  -OutFile ".agents\agents.md"
```

Then exclude it from git so it's never committed:

```bash
# Add to local-only git exclude (not .gitignore)
echo ".agents/" >> .git/info/exclude
```

The file contains the same instructions returned by `mcp_get_agent_context` — both options are equivalent.

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

## Agent context workflow

`mcp_get_agent_context` returns the content of [`agents/agents-template.md`](agents/agents-template.md).

Conventions enforced by the template:

1. **Cache-first ticket init** — checks `.agents/[TICKET_ID].md` locally before calling Jira.
2. **Clean Confluence docs** — search → read top pages → propose structure → wait for confirmation → create.
3. **Progress logging** — `git diff`-based devlog appended to `.agents/[TICKET_ID].md`.
4. **Git exclude** — `.agents/`, `.env` and `mcp.info` should be added to `.git/info/exclude` in each repo (local-only, never committed).

---

## Confluence documentation wrapper

```bash
node confluence-doc.js --topic "My Topic" --space "ENG" [--parentId 12345]
```

Automates the search → read → propose → confirm → create flow in a single CLI command.

---

## Requirements

- Node.js >= 18

---

## Credentials setup

Each developer needs a personal Atlassian API token. One-time setup:

### 1. Generate your API token

1. Open: **https://id.atlassian.com/manage-profile/security/api-tokens**
2. Click **"Create API token"** → give it a name (e.g. `mcp-local`) → **Create**.
3. Copy the token immediately (it won't be shown again).

### 2. Fill in `.env`

After `npm install`, a `.env` file is created automatically from `.env.example`. Just edit it:

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

If you see `Atlassian MCP HTTP server listening on http://localhost:3847/` — you're done.
