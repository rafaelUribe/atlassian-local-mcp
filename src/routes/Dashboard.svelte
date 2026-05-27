<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { getHealth, getConfig, saveConfig, BASE } from '../lib/api';
  import { serverConnected, configured } from '../lib/stores';

  const dispatch = createEventDispatcher();

  let toolsCount = 0;
  let uptimeBase = 0;
  let uptimeTimestamp = Date.now();
  let lastCheckTime = Date.now();
  let uptimeText = '0s';
  let lastCheckText = 'just now';
  let quickOutput = '';

  // Active tickets
  let activeTickets: string[] = [];
  let ticketInput = '';

  // Copy button state
  let copyLabel = 'Copy';

  const SNIPPET = `# Agent Context — Atlassian Local MCP

## ⚡ DO THIS NOW

> **If you are in Ask or Plan mode and cannot run terminal commands, stop and ask the user:**
> "I need to run setup commands in the terminal. Should I proceed now? (Switch to Agent mode if needed)"
> Do not continue until you can execute commands.

Run these commands immediately in the repo root, before anything else:

**Linux / macOS / Git Bash:**
\`\`\`
mkdir -p .agents
grep -qxF '.agents/' .git/info/exclude 2>/dev/null || echo '.agents/' >> .git/info/exclude
grep -qxF 'agents.md' .git/info/exclude 2>/dev/null || echo 'agents.md' >> .git/info/exclude
curl -s -X POST http://localhost:3847/ \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp_get_agent_context","arguments":{}}}' \\
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['content'][0]['text'])" > agents.md
echo "✓ Done"
\`\`\`

**Windows (PowerShell):**
\`\`\`
if (-not (Test-Path .agents)) { New-Item -ItemType Directory -Path .agents | Out-Null }
$ex = '.git\\info\\exclude'
if (-not (Test-Path $ex)) { New-Item -ItemType File -Path $ex -Force | Out-Null }
$c = Get-Content $ex -ErrorAction SilentlyContinue
@('.agents/', 'agents.md') | ForEach-Object { if ($c -notcontains $_) { Add-Content $ex $_ } }
$r = Invoke-RestMethod http://localhost:3847/ -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp_get_agent_context","arguments":{}}}'
$r.result.content[0].text | Set-Content agents.md -Encoding UTF8
Write-Host "✓ Done — agents.md saved"
\`\`\`

Then confirm to the user: ✓ Local agent infrastructure ready. \`agents.md\` saved with full workflow.`;

  function formatUptime(s: number): string {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  async function refresh() {
    try {
      const data = await getHealth();
      toolsCount = data.tools;
      uptimeBase = data.uptime;
      uptimeTimestamp = Date.now();
      serverConnected.set(true);
    } catch {
      serverConnected.set(false);
    }
    lastCheckTime = Date.now();
  }

  async function persistTickets() {
    try {
      const cfg = await getConfig();
      cfg.ACTIVE_TICKETS = activeTickets.join(',');
      await saveConfig(cfg);
    } catch {}
  }

  function addTicket() {
    const val = ticketInput.trim().toUpperCase();
    if (val && !activeTickets.includes(val)) {
      activeTickets = [...activeTickets, val];
      persistTickets();
    }
    ticketInput = '';
  }

  function removeTicket(t: string) {
    activeTickets = activeTickets.filter(x => x !== t);
    persistTickets();
  }

  function copySnippet() {
    navigator.clipboard.writeText(SNIPPET).then(() => {
      copyLabel = '✓ Copied!';
      setTimeout(() => { copyLabel = 'Copy'; }, 2000);
    });
  }

  let ticker: ReturnType<typeof setInterval>;
  let refreshInterval: ReturnType<typeof setInterval>;

  onMount(async () => {
    await refresh();
    try {
      const cfg = await getConfig();
      activeTickets = cfg.ACTIVE_TICKETS ? cfg.ACTIVE_TICKETS.split(',').map(t => t.trim()).filter(Boolean) : [];
    } catch {}

    ticker = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastCheckTime) / 1000);
      lastCheckText = elapsed < 1 ? 'just now' : `${elapsed}s ago`;
      uptimeText = formatUptime(uptimeBase + Math.floor((Date.now() - uptimeTimestamp) / 1000));
    }, 1000);

    refreshInterval = setInterval(refresh, 30000);
  });

  onDestroy(() => {
    clearInterval(ticker);
    clearInterval(refreshInterval);
  });
</script>

<h1>Dashboard</h1>

<div class="cards">
  <div class="card">
    <h3>Server</h3>
    <p style="font-size:1rem">{BASE}</p>
    <small>Endpoint URL</small>
  </div>
  <div class="card">
    <h3>Tools</h3>
    <p>{toolsCount}</p>
    <small>Available</small>
  </div>
  <div class="card">
    <h3>Uptime</h3>
    <p>{uptimeText}</p>
    <small>Since last start</small>
  </div>
</div>

<p class="last-check">Last check: <span>{lastCheckText}</span></p>

<h2>Quick Test</h2>
<div class="quick-test">
  <button on:click={async () => {
    const data = await getHealth();
    quickOutput = JSON.stringify({ ...data, uptime: formatUptime(data.uptime) }, null, 2);
  }}>Check Health</button>
  {#if quickOutput}
    <pre>{quickOutput}</pre>
  {/if}
</div>

<h2>Connect your agent</h2>
<p class="section-subtitle">Copy this into your repo as <code>agents.md</code> — the agent will self-setup and connect to the MCP.</p>
<div class="setup-block">
  <pre id="mcp-json-snippet">{SNIPPET}</pre>
  <button type="button" on:click={copySnippet}>{copyLabel}</button>
  <p class="hint">Then run: <code>echo agents.md &gt;&gt; .git/info/exclude</code> — works with any IDE or agent.</p>
</div>

<h2>Active Tickets</h2>
<div class="tickets-config">
  <div class="branch-input-row">
    <input
      type="text"
      bind:value={ticketInput}
      placeholder="RWD-1234"
      on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTicket(); } }}
    />
    <button type="button" on:click={addTicket}>Add</button>
  </div>
  {#if activeTickets.length}
    <ul class="branch-tags">
      {#each activeTickets as t}
        <li>
          <span>{t}</span>
          <button type="button" on:click={() => removeTicket(t)}>&times;</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
