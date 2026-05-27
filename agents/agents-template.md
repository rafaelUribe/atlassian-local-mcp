# AI Agent Context — [REPO NAME]

> Local-only file. Never committed.
> Managed automatically by Step 0 below (adds `.agents/` to `.git/info/exclude`).
> Source: [atlassian-local-mcp](https://github.com/rafaelUribe/atlassian-local-mcp)

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

### Step 0 — Self-Setup (run once per repo, idempotent)

Before doing anything else, verify the local agent infrastructure exists in this repo:

1. **Check if `.agents/` directory exists.** If not, create it:
   ```bash
   mkdir -p .agents
   ```
2. **Check `.git/info/exclude` for required entries.** If any are missing, append them:
   ```bash
   # Entries to ensure (one per line):
   # .agents/
   # .env
   # mcp.info
   grep -qxF '.agents/' .git/info/exclude 2>/dev/null || echo '.agents/' >> .git/info/exclude
   grep -qxF '.env' .git/info/exclude 2>/dev/null || echo '.env' >> .git/info/exclude
   grep -qxF 'mcp.info' .git/info/exclude 2>/dev/null || echo 'mcp.info' >> .git/info/exclude
   ```
   On Windows (PowerShell):
   ```powershell
   if (-not (Test-Path .agents)) { New-Item -ItemType Directory -Path .agents | Out-Null }
   $exclude = '.git\info\exclude'
   $entries = @('.agents/', '.env', 'mcp.info')
   if (-not (Test-Path $exclude)) { New-Item -ItemType File -Path $exclude -Force | Out-Null }
   $content = Get-Content $exclude -ErrorAction SilentlyContinue
   foreach ($e in $entries) {
     if ($content -notcontains $e) { Add-Content $exclude $e }
   }
   ```
3. **This step is idempotent** — safe to run every time. If everything already exists, it does nothing.

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

**Before executing any git command, present the plan to the user and ask for explicit confirmation:**

```
I will perform the following git operations:
  1. Stash uncommitted changes (if any)
  2. Pull latest from develop (and test if it exists)
  3. [Create / Switch to] branch task/[TICKET_ID]

Proceed? (y/n)
```

**Only after receiving `y` or explicit confirmation**, execute:

```bash
# 1. Check for uncommitted changes — stash if necessary
git status --porcelain
# If dirty: git stash push -m "auto-stash before [TICKET_ID]"

# 2. Sync base branches
git checkout develop && git pull
git checkout test    && git pull   # skip if 'test' branch doesn't exist

# 3. Branch control
# If task/[TICKET_ID] already exists locally or remotely:
git checkout task/[TICKET_ID] && git merge develop
# If it does NOT exist:
git checkout develop && git checkout -b task/[TICKET_ID]
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
