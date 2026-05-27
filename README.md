# atlassian-local-mcp

Local MCP server exposing **52 tools** (Jira, Confluence, Bitbucket + agent context) as a JSON-RPC 2.0 HTTP endpoint.  
Designed for AI coding agents (GitHub Copilot, Cursor, Windsurf, etc.) running in **any repo** on a developer's machine.

> **Unofficial team tool.** Nothing gets committed to your working repos — everything stays local.

---

## Quick Start

```bash
git clone git@github.com:rafaelUribe/atlassian-local-mcp.git
cd atlassian-local-mcp
npm install
```

Edit `.env` with your credentials (only 3 required):

```env
JIRA_HOST=your-company.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_TOKEN=your_api_token
```

> Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens

Start:

```bash
npm start
# → Atlassian MCP HTTP server listening on http://localhost:3847/
```

Connect your AI agent to `http://localhost:3847/` and you're done.

<details>
<summary><strong>VS Code example</strong> — <code>.vscode/mcp.json</code> in your working repo</summary>

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
</details>

---

## How it works

```
┌─────────────────────────────────────────────────────┐
│  YOUR MACHINE                                       │
│                                                     │
│  ~/anywhere/atlassian-local-mcp/    ← THIS REPO    │
│    └─ npm start → serves on :3847                   │
│                                                     │
│  ~/work/your-project/               ← WORKING REPO │
│    └─ .agents/          ← local-only, never pushed  │
│         ├─ agents.md    ← workflow instructions     │
│         ├─ config.json  ← branch settings           │
│         └─ RWD-1234.md  ← ticket context (cache)   │
└─────────────────────────────────────────────────────┘
```

The MCP repo is a **background service**. Your working repo is where you code. They never touch each other's git history.

The AI agent calls `mcp_get_agent_context` at session start to get workflow instructions. It then auto-creates `.agents/` in your working repo (excluded from git via `.git/info/exclude`).

---

## Configuration

### Per-project settings (`.agents/config.json`)

Created automatically by the agent on first run. Edit to match your project's branching model:

```json
{
  "baseBranches": ["develop", "test"],
  "branchPrefix": "task/"
}
```

| Field | Default | Examples |
|---|---|---|
| `baseBranches` | `["develop", "test"]` | `["main"]`, `["develop", "staging"]`, `["master"]` |
| `branchPrefix` | `"task/"` | `"feature/"`, `"bugfix/"`, `"hotfix/"` |

This file lives in `.agents/` — never committed, fully local.

### MCP server settings (`.env`)

| Variable | Required | Where to find it |
|---|---|---|
| `JIRA_HOST` | **Yes** | Your Atlassian URL without `https://` — e.g. `acme.atlassian.net` |
| `JIRA_EMAIL` | **Yes** | The email you log into Atlassian with |
| `JIRA_TOKEN` | **Yes** | [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `BITBUCKET_WORKSPACE` | No | Go to `https://bitbucket.org/` → slug in the URL: `bitbucket.org/{workspace}`. Only needed for Bitbucket tools. |
| `HTTP_PORT` | No | Default: `3847` |
| `HTTP_BIND` | No | Default: `0.0.0.0` |

---

## Alternative: manual file import

If you can't configure MCP in your editor, download the template directly into your working repo:

```bash
mkdir -p .agents
curl -sL https://raw.githubusercontent.com/rafaelUribe/atlassian-local-mcp/main/agents/agents-template.md \
  -o .agents/agents.md
echo '.agents/' >> .git/info/exclude
```

<details>
<summary>Windows (PowerShell)</summary>

```powershell
New-Item -ItemType Directory -Force -Path .agents | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/rafaelUribe/atlassian-local-mcp/main/agents/agents-template.md" `
  -OutFile ".agents\agents.md"
Add-Content .git\info\exclude ".agents/"
```
</details>

---

## Agent workflow

| Step | What happens | Idempotent? |
|---|---|---|
| **0 — Self-Setup** | Creates `.agents/`, `config.json`, adds git exclude entries | ✓ |
| **1 — Cache check** | Looks for `.agents/[TICKET].md` before calling APIs | ✓ |
| **2 — Jira fetch** | Gets ticket data (AC, description, priority) | Only if cache miss |
| **3 — Context file** | Creates `.agents/[TICKET].md` with structured data | Once per ticket |
| **4 — Git ops** | **Asks confirmation first**, then pull + branch | User controls |
| **5 — Work plan** | Analyzes code, proposes plan | Only for new tickets |

Nothing commits or pushes without your explicit `y`.

---

## What stays local (never committed)

| Item | Location | Mechanism |
|---|---|---|
| `.agents/` | Working repo | `.git/info/exclude` (local-only, invisible to git) |
| `.env` | This MCP repo | Contains credentials, auto-excluded |
| `mcp.info` | This MCP repo | Runtime file, auto-excluded |

---

<details>
<summary><strong>Tools reference (52 total)</strong></summary>

### Jira (20 tools)

| Tool | What it does |
|---|---|
| `jira_search_tickets` | Search issues with JQL |
| `jira_get_ticket` | Full ticket details (description, comments, subtasks, sprint) |
| `jira_get_my_tickets` | Your assigned in-progress/pending tickets |
| `jira_get_projects` | List all projects |
| `jira_get_boards` | List Scrum/Kanban boards (get boardId for sprints) |
| `jira_get_sprints` | List sprints for a board |
| `jira_get_sprint_tickets` | Tickets in active sprint |
| `jira_create_ticket` | Create a new issue |
| `jira_update_ticket` | Update fields (summary, description, priority, assignee, labels) |
| `jira_transition_ticket` | Move ticket to a new status |
| `jira_get_transitions` | List available status transitions |
| `jira_add_comment` | Add a comment |
| `jira_delete_comment` | Delete a comment |
| `jira_get_issue_types` | List issue types (Story, Bug, Task…) |
| `jira_link_issues` | Link two tickets (blocks, relates to…) |
| `jira_get_link_types` | List available link types |
| `jira_get_user` | Search users by name/email (get accountId) |
| `jira_get_fields` | List all custom fields |
| `jira_get_project_components` | List project components |
| `jira_get_project_versions` | List Fix Versions |
| `jira_get_changelogs` | Ticket change history |

### Confluence (14 tools)

| Tool | What it does |
|---|---|
| `confluence_search` | Search pages with CQL |
| `confluence_get_page` | Full page content by ID |
| `confluence_get_spaces` | List all spaces |
| `confluence_get_space_pages` | List pages in a space |
| `confluence_create_page` | Create a new page |
| `confluence_update_page` | Update page content |
| `confluence_delete_page` | Delete a page |
| `confluence_get_page_children` | List child pages |
| `confluence_add_comment` | Add a comment to a page |
| `confluence_get_page_comments` | List page comments |
| `confluence_get_page_labels` | List page labels |
| `confluence_add_page_label` | Add a label to a page |
| `confluence_get_page_attachments` | List page attachments |

### Bitbucket (17 tools) — requires `BITBUCKET_WORKSPACE`

| Tool | What it does |
|---|---|
| `bitbucket_get_repos` | List workspace repositories |
| `bitbucket_get_pull_requests` | List PRs (open/merged/declined) |
| `bitbucket_get_pull_request` | Full PR details |
| `bitbucket_create_pull_request` | Create a new PR |
| `bitbucket_add_pr_comment` | Comment on a PR |
| `bitbucket_get_pr_comments` | List PR comments |
| `bitbucket_approve_pr` | Approve a PR |
| `bitbucket_unapprove_pr` | Remove approval |
| `bitbucket_merge_pr` | Merge a PR |
| `bitbucket_decline_pr` | Decline a PR |
| `bitbucket_get_branches` | List branches |
| `bitbucket_get_commits` | List commits from a branch |
| `bitbucket_get_diff` | Get PR diff |
| `bitbucket_get_file` | Read a file from a branch |
| `bitbucket_get_pipelines` | List recent pipelines |
| `bitbucket_get_pipeline` | Pipeline details |
| `bitbucket_list_workspace_members` | List workspace members |

### Meta (1 tool)

| Tool | What it does |
|---|---|
| `mcp_get_agent_context` | Returns workflow instructions for AI agents (call at session start) |

</details>

---

<details>
<summary><strong>Confluence documentation wrapper</strong></summary>

```bash
node confluence-doc.js --topic "My Topic" --space "ENG" [--parentId 12345]
```

Automates the search → read → propose → confirm → create flow in a single CLI command.

</details>

---

## FAQ

<details>
<summary>Does this modify my working repo in any way visible to git?</summary>

No. `.agents/` is excluded via `.git/info/exclude` — a local-only mechanism that's never committed.
</details>

<details>
<summary>Can my teammates see that I'm using this?</summary>

No. Unless you choose to commit `.vscode/mcp.json` (which is just a URL, no secrets).
</details>

<details>
<summary>What if I re-clone my working repo?</summary>

The agent re-runs Step 0 automatically on the next session and recreates everything.
</details>

<details>
<summary>Do I need to keep a terminal open?</summary>

Yes — the MCP server must be running. You can also run it as a background process or system service.
</details>

---

## Requirements

- Node.js >= 18
- Atlassian Cloud account with API token

---

## Prerequisites: Built-in AI (Optional)

The UI includes an **AI assistant** powered by the browser's **LanguageModel API** — a local on-device model (Gemini Nano in Chrome, Phi-mini in Edge) that runs entirely in your browser. No API keys, no cloud calls, no data leaves your machine.

This feature is **optional**. The MCP works fully without it — you only lose the AI tab (JQL/CQL generation, summarization, chat).

---

### Google Chrome Configuration

Requires **Chrome 127+** (Stable, Beta, Dev, or Canary).

#### 1. Enable the required flags

Open a new tab and navigate to `chrome://flags`. Locate and configure:

| Flag | Value |
|---|---|
| `#prompt-api-for-gemini-nano` | **Enabled** |
| `#optimization-guide-on-device-model` | **Enabled BypassPerfRequirement** |

> **Why BypassPerfRequirement?** This skips hardware checks (minimum RAM/disk) that might otherwise block the download on older machines.

#### 2. Restart the browser

Navigate to `chrome://restart` to force a complete restart. All tabs will be restored automatically.

#### 3. Download the model

1. Open `chrome://components`
2. Find the component named **"Optimization Guide On Device Model"**
3. Click **"Check for update"**
4. Wait until the status shows a version number and "Up-to-date" (~3-4 GB download)

> The download happens in the background. You can continue working — just don't close Chrome.

---

### Microsoft Edge Configuration

Requires **Edge Dev or Canary channel** (version 127+).

#### 1. Enable the required flags

Open a new tab and navigate to `edge://flags`. Locate and configure:

| Flag | Value |
|---|---|
| `Prompt API for Phi mini` | **Enabled** |
| `#optimization-guide-on-device-model` | **Enabled BypassPerfRequirement** |

> If you can't find "Prompt API for Phi mini" by name, search for `#edge-local-ai-prompt-api` in the flags page.

#### 2. Restart the browser

Navigate to `edge://restart` to force a complete restart.

> **If flags don't apply after restart:** Open Windows Task Manager → End all Microsoft Edge background processes → Reopen Edge.

#### 3. Download the model

1. Open `edge://components`
2. Find the component named **"Optimization Guide On Device Model"** (may also appear as **"Microsoft Edge AI Engine"**)
3. Click **"Check for update"**
4. Wait for the download to complete

---

### Verification (Both Browsers)

Open **DevTools** (F12 or Ctrl+Shift+I) on any **HTTPS** page (e.g., `https://google.com`) and run in the Console:

```js
await LanguageModel.availability();
```

| Result | Meaning |
|---|---|
| `'available'` | Model is ready — the AI tab in the MCP UI will work |
| `'downloading'` | Model is currently downloading — wait a few minutes |
| `'downloadable'` | Model weights (~3-4 GB) are missing — the MCP UI will trigger the download automatically |
| `ReferenceError` | API not enabled — revisit the flags configuration above |

> **Important:** The LanguageModel API only works on **secure origins** (HTTPS or `localhost`). Since the MCP UI runs on `http://localhost:3847/ui/`, it qualifies automatically.

---

### Technical Details (for developers)

The MCP UI implementation follows these verified behaviors from the latest Chromium API:

- **API namespace:** Strictly `LanguageModel` global constructor. Legacy namespaces (`window.ai`, `ai.languageModel`) are deprecated and not targeted.
- **Download trigger:** When `availability()` returns `'downloadable'`, the UI calls `LanguageModel.create()` inside a try/catch to wake up the browser's download engine. The model then downloads via the components system.
- **Streaming (deltas):** `session.promptStreaming(prompt)` returns **raw delta tokens** (sub-word fragments), not cumulative text. The UI concatenates them with `+=` to build the full response progressively.
- **Localization:** Sessions are created with explicit `expectedInputLanguages` and `outputLanguage` parameters to prevent safety filter blocking in non-English contexts (both Gemini Nano and Phi-mini silently fail otherwise, returning empty streams).

> **Note:** If you don't enable this, the AI tab shows setup instructions instead of hiding — all other features (dashboard, config, tools explorer) work normally.
