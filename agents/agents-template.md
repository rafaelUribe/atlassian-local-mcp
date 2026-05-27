# AI Agent Context — [REPO NAME]

> Local-only file. Never committed.
> Source: [atlassian-local-mcp](https://github.com/rafaelUribe/atlassian-local-mcp)

---

## ⚡ DO THIS NOW — Mandatory Self-Setup

> **Execute immediately after reading this file. Do not wait for a user command.**

Run these commands in the repo root before doing anything else:

**Linux / macOS / Git Bash:**
```bash
mkdir -p .agents
grep -qxF '.agents/' .git/info/exclude 2>/dev/null || echo '.agents/' >> .git/info/exclude
grep -qxF 'agents.md' .git/info/exclude 2>/dev/null || echo 'agents.md' >> .git/info/exclude
grep -qxF '.env' .git/info/exclude 2>/dev/null || echo '.env' >> .git/info/exclude
grep -qxF 'mcp.info' .git/info/exclude 2>/dev/null || echo 'mcp.info' >> .git/info/exclude
echo "✓ Self-setup complete"
```

**Windows (PowerShell):**
```powershell
if (-not (Test-Path .agents)) { New-Item -ItemType Directory -Path .agents | Out-Null }
$exclude = '.git\info\exclude'
if (-not (Test-Path $exclude)) { New-Item -ItemType File -Path $exclude -Force | Out-Null }
$content = Get-Content $exclude -ErrorAction SilentlyContinue
@('.agents/', 'agents.md', '.env', 'mcp.info') | ForEach-Object {
  if ($content -notcontains $_) { Add-Content $exclude $_ }
}
Write-Host "✓ Self-setup complete"
```

This is **idempotent** — safe to run every time, does nothing if already set up.

After running, confirm to the user:
> ✓ Local agent infrastructure ready. `.agents/` created and git-excluded.

---

## MCP — Discovery & Connection

The Atlassian MCP server **must be running locally** for any agent in this repo to access Jira, Confluence or Bitbucket.

**Start the MCP (one terminal, leave running):**

```bash
cd /path/to/atlassian-local-mcp && npm start
```

Default endpoint: `http://localhost:3847/`  
Health check: `GET http://localhost:3847/health`

**Verify connectivity:**

```bash
curl -s http://localhost:3847/health
# Expected: {"status":"ok"}
```

> The server writes a `mcp.info` file in its own directory on startup. If you need the URL programmatically, read that file. No environment variables are required.

**Available tools (52):**

| Category | Count | Key tools |
|---|---|---|
| Jira | 20 | `jira_get_ticket`, `jira_search_tickets`, `jira_create_ticket`, `jira_get_sprint_tickets` |
| Confluence | 14 | `confluence_search`, `confluence_get_page`, `confluence_create_page` |
| Bitbucket | 17 | `bitbucket_get_pull_requests`, `bitbucket_create_pull_request`, `bitbucket_get_diff` |
| Agent | 1 | `mcp_get_agent_context` |

**Tool name mapping** (some AI agents use different names):

| Requested name | Real MCP tool |
|---|---|
| `getJiraIssue` | `jira_get_ticket` |
| `searchJiraIssuesUsingJql` | `jira_search_tickets` |
| `searchConfluenceUsingCql` | `confluence_search` |
| `getConfluencePage` | `confluence_get_page` |
| `createConfluencePage` | `confluence_create_page` |

---

## Clean Documentation Workflow in Confluence

> **Applies to every AI agent operating in this repo. Read before creating any Confluence page.**

- When requested to document a topic, it is **STRICTLY PROHIBITED** to create pages directly.
- **Search first.** Use `confluence_search` (CQL) to look for semantically related articles before any other action. Example:
  ```
  text ~ "<topic>" AND type = page AND space = "<SPACE>" ORDER BY lastmodified DESC
  ```
- **Read top 2-3 results.** Call `confluence_get_page` for each of the top results to inspect their structure (headers, sections, writing style).
- **Present a proposal** before creating anything. Output to console:
  - Suggested parent page (title + ID)
  - Proposed index structure (H1 -> H2 -> sections)
  - List of detected duplicates with their URLs
  - Explicit question: `Do you confirm the creation? (y/n)`
- **Wait for explicit confirmation.** Only call `confluence_create_page` if the user responds affirmatively.

**Wrapper available:**

```bash
# From the atlassian-local-mcp directory
node confluence-doc.js --topic "<topic>" --space "<KEY>" [--parentId <id>]
```

Automates steps 1-3, prints the proposal, and waits for stdin confirmation before creating.

---

## Idempotent Ticket Initialization (Jira + Git Workflow)

> **ACTIVATION:** Triggered by commands like `"Start ticket [TICKET_ID]"` or `"Work on [TICKET_ID]"`.

### Step 0 — Self-Setup (already done at load time, verify only)

The mandatory self-setup runs automatically when this file is first read (see top section).
If `.agents/` does not exist for any reason, re-run the setup commands from the top of this file before continuing.

### Step 1 — File Verification (cache-first)

Before calling any external API (Jira / Confluence), check if `.agents/[TICKET_ID].md` already exists.

- **If it EXISTS:** Stop all API queries immediately. Read the file to load context into memory, skip directly to Step 4 (Git Automation), and **do NOT rewrite the file**.
- **If it DOES NOT EXIST:** Proceed to Step 2.

### Step 2 — Jira Context

Call `jira_get_ticket` (or `jira_search_tickets` with JQL `issue = [TICKET_ID]`) to fetch:

- Acceptance Criteria (AC), description, priority, type, sprint, assignee.

### Step 3 — Relational Context & File Creation

Run in parallel:
- `jira_search_tickets` (JQL) for related tickets / dependencies.
- `confluence_search` for relevant technical documentation.

Create `.agents/[TICKET_ID].md` with this structured data.

### Step 4 — Git Automation (requires confirmation)

**Use the configured branches and prefix:**
- **Base Branches:** {{BASE_BRANCHES}}
- **Branch Prefix:** `{{BRANCH_PREFIX}}`

**Before executing any git command, present the plan to the user and ask for explicit confirmation:**

```
I will perform the following git operations:
  1. Stash uncommitted changes (if any)
  2. Pull latest from: {{BASE_BRANCHES}}
  3. [Create / Switch to] branch {{BRANCH_PREFIX}}[TICKET_ID]

Proceed? (y/n)
```

**Only after receiving `y` or explicit confirmation**, execute:

```bash
# 1. Check for uncommitted changes — stash if necessary
git status --porcelain
# If dirty: git stash push -m "auto-stash before [TICKET_ID]"

# 2. Sync base branches: {{BASE_BRANCHES}}
# For each branch in the list:
#   git checkout <branch> && git pull
#   (skip silently if branch doesn't exist locally or remotely)

# 3. Branch control (prefix: {{BRANCH_PREFIX}})
# If {{BRANCH_PREFIX}}[TICKET_ID] already exists locally or remotely:
git checkout {{BRANCH_PREFIX}}[TICKET_ID] && git merge <first base branch>
# If it does NOT exist:
git checkout <first base branch> && git checkout -b {{BRANCH_PREFIX}}[TICKET_ID]
```

If the user declines, skip git operations and proceed to Step 5 with the context already loaded.

### Step 5 — Technical Work Plan

If the file was newly created in Step 3, append a `## Proposed Work Plan` section by analyzing relevant source code. Notify in console when ready.

---

## Progress Logging (Post-Modification)

> **ACTIVATION:** Triggered automatically after completing a code modification/refactor task, or via commands like `"Log changes"` or `"Update devlog"`.

### Step 1 — Change Inspection

Run `git diff` or `git status` locally to identify precisely which files were modified, created, or deleted.

### Step 2 — Markdown Update

Target `.agents/[TICKET_ID].md` safely:
- Search for a `### Changes Made` section.
- If it **does not exist**: create it at the end of the file.
- If it **does exist**: append new progress chronologically (never overwrite past entries).

### Step 3 — Technical Logging Format

```markdown
### Changes Made

#### [YYYY-MM-DD HH:MM] — <brief task description>

**Modified files:**
- `path/to/File.java` — reason for change

**Technical summary:**
<Concise explanation of the logic implemented: fixes, features, refactors>

**Current state:** Ready for local testing | Pending unit tests | Merged to develop
```

### Step 4 — Confirmation

Print a console message confirming the devlog update:

```
[OK] Devlog updated in .agents/[TICKET_ID].md
```

---

## Git Exclude — Local Files (Never Committed)

The following entries must be in `.git/info/exclude` for this repo (set automatically by Step 0 above):

```
.agents/
.env
mcp.info
```

These are local-only excludes — they don't modify `.gitignore` and are never committed. If you re-clone the repo, Step 0 will re-apply them automatically on the next agent session.
