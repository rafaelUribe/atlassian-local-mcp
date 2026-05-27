<script lang="ts">
  import { onMount } from 'svelte';
  import { getConfig, saveConfig } from '../lib/api';
  import { configured } from '../lib/stores';

  // Chip arrays
  let baseBranches: string[] = [];
  let confluenceSpaces: string[] = [];
  let bitbucketProjects: string[] = [];
  let branchInput = '';
  let cspaceInput = '';
  let bprojInput = '';

  // Form status
  let status = '';
  let statusOk = true;

  // Form field values
  let fields: Record<string, string> = {
    JIRA_HOST: '', JIRA_EMAIL: '', JIRA_TOKEN: '',
    BITBUCKET_WORKSPACE: '', BRANCH_PREFIX: 'task/',
    HTTP_PORT: '3847', JIRA_EPIC: '',
  };

  function addBranch() {
    const v = branchInput.trim();
    if (v && !baseBranches.includes(v)) baseBranches = [...baseBranches, v];
    branchInput = '';
  }

  function addCSpace() {
    const v = cspaceInput.trim().toUpperCase();
    if (v && !confluenceSpaces.includes(v)) confluenceSpaces = [...confluenceSpaces, v];
    cspaceInput = '';
  }

  function addBProj() {
    const v = bprojInput.trim().toUpperCase();
    if (v && !bitbucketProjects.includes(v)) bitbucketProjects = [...bitbucketProjects, v];
    bprojInput = '';
  }

  async function handleSubmit() {
    const data: Record<string, string> = {
      ...fields,
      BASE_BRANCHES: baseBranches.join(','),
      CONFLUENCE_SPACES: confluenceSpaces.join(','),
      BITBUCKET_PROJECTS: bitbucketProjects.join(','),
    };
    const result = await saveConfig(data);
    if (result.ok) {
      status = '✓ Saved! Server restarting…';
      statusOk = true;
      // Poll until server is back, then reload
      setTimeout(async () => {
        for (let i = 0; i < 10; i++) {
          try { await fetch('/health'); window.location.reload(); return; } catch {}
          await new Promise(r => setTimeout(r, 500));
        }
        status = '✓ Saved. Refresh manually if needed.';
      }, 1000);
    } else {
      status = `✗ ${result.error}`;
      statusOk = false;
    }
    setTimeout(() => { status = ''; }, 6000);
  }

  onMount(async () => {
    try {
      const cfg = await getConfig();
      for (const [k, v] of Object.entries(cfg)) {
        if (k === 'BASE_BRANCHES') {
          baseBranches = v ? v.split(',').map((b: string) => b.trim()).filter(Boolean) : [];
        } else if (k === 'CONFLUENCE_SPACES') {
          confluenceSpaces = v ? v.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
        } else if (k === 'BITBUCKET_PROJECTS') {
          bitbucketProjects = v ? v.split(',').map((p: string) => p.trim()).filter(Boolean) : [];
        } else if (k in fields) {
          fields[k] = v;
        }
      }
      fields = { ...fields }; // trigger reactivity
    } catch {}
  });
</script>

<h1>Configuration</h1>

<div class="config-section">
  <h2>Server Credentials (.env)</h2>
  <p class="hint">Stored only in this MCP repo's <code>.env</code> — never committed.</p>

  <form on:submit|preventDefault={handleSubmit}>
    <label>Atlassian Domain <span class="required">*</span>
      <input type="text" bind:value={fields.JIRA_HOST} placeholder="your-company.atlassian.net" />
      <small>Your company's Atlassian cloud domain</small>
    </label>

    <label>Company Email <span class="required">*</span>
      <input type="email" bind:value={fields.JIRA_EMAIL} placeholder="you@company.com" />
    </label>

    <label>Atlassian API Token <span class="required">*</span>
      <input type="password" bind:value={fields.JIRA_TOKEN} placeholder="Your API token" />
      <small><a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener">Generate token ↗</a></small>
    </label>

    <label>Bitbucket Workspace <span class="optional">optional</span>
      <input type="text" bind:value={fields.BITBUCKET_WORKSPACE} placeholder="your-workspace-slug" />
      <small>Found in: bitbucket.org/<strong>{'{this-part}'}</strong></small>
    </label>

    <!-- Bitbucket Projects chips -->
    <div class="branch-config">
      <label>Bitbucket Projects <span class="optional">optional</span></label>
      <small>Filter repos by project key (e.g. <code>DIGCOM</code>, <code>FIRSTCALL</code>). Leave empty to load all workspace repos.</small>
      <div class="branch-input-row">
        <input
          type="text" bind:value={bprojInput} placeholder="e.g. DIGCOM"
          on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBProj(); } }}
        />
        <button type="button" on:click={addBProj}>Add</button>
      </div>
      {#if bitbucketProjects.length}
        <ul class="branch-tags">
          {#each bitbucketProjects as p, i}
            <li><span>{p}</span><button type="button" on:click={() => { bitbucketProjects = bitbucketProjects.filter((_, j) => j !== i); }}>&times;</button></li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Confluence Spaces chips -->
    <div class="branch-config">
      <label>Confluence Spaces <span class="optional">optional</span></label>
      <small>Only these spaces will be indexed/cached. Leave empty to allow all.</small>
      <div class="branch-input-row">
        <input
          type="text" bind:value={cspaceInput} placeholder="e.g. B2B"
          on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCSpace(); } }}
        />
        <button type="button" on:click={addCSpace}>Add</button>
      </div>
      {#if confluenceSpaces.length}
        <ul class="branch-tags">
          {#each confluenceSpaces as s, i}
            <li><span>{s}</span><button type="button" on:click={() => { confluenceSpaces = confluenceSpaces.filter((_, j) => j !== i); }}>&times;</button></li>
          {/each}
        </ul>
      {/if}
    </div>

    <label>Jira Epic <span class="optional">optional</span>
      <input type="text" bind:value={fields.JIRA_EPIC} placeholder="B2B-123 or project = B2B" />
      <small>Epic key or JQL — cache only indexes tickets under this epic/project</small>
    </label>

    <!-- Base Branches chips -->
    <div class="branch-config">
      <label>Base Branches</label>
      <div class="branch-input-row">
        <input
          type="text" bind:value={branchInput} placeholder="e.g. develop"
          on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBranch(); } }}
        />
        <button type="button" on:click={addBranch}>Add</button>
      </div>
      {#if baseBranches.length}
        <ul class="branch-tags">
          {#each baseBranches as b, i}
            <li><span>{b}</span><button type="button" on:click={() => { baseBranches = baseBranches.filter((_, j) => j !== i); }}>&times;</button></li>
          {/each}
        </ul>
      {/if}
    </div>

    <label>Branch Prefix
      <input type="text" bind:value={fields.BRANCH_PREFIX} placeholder="task/" />
      <small>Prefix for new feature branches (e.g. task/, feature/)</small>
    </label>

    <label>HTTP Port
      <input type="number" bind:value={fields.HTTP_PORT} placeholder="3847" />
    </label>

    <div class="form-actions">
      <button type="submit">Save .env</button>
      {#if status}
        <span style="font-size:0.85rem; color: {statusOk ? 'var(--success)' : 'var(--danger)'}">{status}</span>
      {/if}
    </div>
  </form>
</div>
