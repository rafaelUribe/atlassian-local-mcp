# atlassian-local-mcp

Local MCP server that exposes **52 tools** for Jira, Confluence, Bitbucket and agent context as a JSON-RPC 2.0 HTTP endpoint.
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

## How agents get context (no local files needed)

The server exposes a tool called **`mcp_get_agent_context`**. Any AI agent can call it at session start to load the full workflow instructions (Confluence docs workflow, ticket initialization, progress logging, git conventions).

```bash
curl -s -X POST http://localhost:3847/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp_get_agent_context","arguments":{}}}' \
  | jq -r '.result.content[0].text'
```

This means your teammates don't need to copy files into their repos. They just need:
1. The MCP server running locally.
2. Their AI agent configured to call `http://localhost:3847/`.

If you prefer a static file, you can still manually copy [`agents/agents-template.md`](agents/agents-template.md) into your repo.

---

## Tools (52 total)

| Category | Count | Example tools |
|---|---|---|
| Jira | 20 | `jira_get_ticket`, `jira_search_tickets`, `jira_create_ticket`, `jira_get_sprint_tickets` |
| Confluence | 14 | `confluence_search`, `confluence_get_page`, `confluence_create_page`, `confluence_update_page` |
| Bitbucket | 17 | `bitbucket_get_pull_requests`, `bitbucket_create_pull_request`, `bitbucket_get_diff`, `bitbucket_get_file` |
| Meta | 1 | `mcp_get_agent_context` |

To list all tools at runtime:

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

The `mcp_get_agent_context` tool returns the content of [`agents/agents-template.md`](agents/agents-template.md).

Key conventions enforced:

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
