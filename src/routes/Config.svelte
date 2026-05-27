<script lang="ts">
  import { onMount } from 'svelte';
  import { getConfig, saveConfig, getBitbucketRepos, getBitbucketProjects, getConfluenceSpaces } from '../lib/api';
  import { configured } from '../lib/stores';

  let activeTab: 'auth' | 'jira' | 'bitbucket' | 'confluence' = 'auth';

  let baseBranches: string[] = [];
  let confluenceSpaces: string[] = [];
  let bitbucketProjects: string[] = [];
  let branchInput = '';
  let cspaceInput = '';
  let bprojInput = '';

  let status = '';
  let statusOk = true;

  let bbRepos: { slug: string; name: string; project?: string }[] = [];
  let bbProjects: { key: string; name: string }[] = [];
  let cfSpaces: { key: string; name: string }[] = [];
  let bbLoading = false;
  let bbProjLoading = false;
  let cfLoading = false;
  let bbError = '';
  let bbProjError = '';
  let cfError = '';
  let cfSearch = '';
  let bbProjSearch = '';
  let bbRepoSearch = '';

  let fields: Record<string, string> = {
    JIRA_HOST: '', JIRA_EMAIL: '', JIRA_TOKEN: '',
    BITBUCKET_WORKSPACE: '', BRANCH_PREFIX: 'task/',
    HTTP_PORT: '3847', JIRA_EPIC: '',
  };

  function addChip(arr: string[], val: string, upper = false): string[] {
    const v = upper ? val.trim().toUpperCase() : val.trim();
    return v && !arr.includes(v) ? [...arr, v] : arr;
  }

  async function testBitbucketRepos() {
    bbLoading = true; bbError = '';
    try { bbRepos = await getBitbucketRepos(); }
    catch (e: unknown) { bbError = e instanceof Error ? e.message : String(e); }
    finally { bbLoading = false; }
  }

  async function testBitbucketProjects() {
    bbProjLoading = true; bbProjError = '';
    try { bbProjects = await getBitbucketProjects(); }
    catch (e: unknown) { bbProjError = e instanceof Error ? e.message : String(e); }
    finally { bbProjLoading = false; }
  }

  async function testConfluenceSpaces() {
    cfLoading = true; cfError = '';
    try { cfSpaces = await getConfluenceSpaces(); }
    catch (e: unknown) { cfError = e instanceof Error ? e.message : String(e); }
    finally { cfLoading = false; }
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
      fields = { ...fields };
    } catch {}
  });
</script>

<h1>Configuration</h1>

<div class="cfg-tabs">
  <button class:active={activeTab === 'auth'}      on:click={() => activeTab = 'auth'}>🔑 Auth</button>
  <button class:active={activeTab === 'jira'}      on:click={() => activeTab = 'jira'}>Jira</button>
  <button class:active={activeTab === 'bitbucket'} on:click={() => activeTab = 'bitbucket'}>Bitbucket</button>
  <button class:active={activeTab === 'confluence'} on:click={() => activeTab = 'confluence'}>Confluence</button>
</div>

<form on:submit|preventDefault={handleSubmit}>

  {#if activeTab === 'auth'}
  <div class="config-section">
    <h2>Atlassian Credentials</h2>
    <p class="hint">Stored only in <code>.env</code> — never committed.</p>

    <label>Atlassian Domain <span class="required">*</span>
      <input type="text" bind:value={fields.JIRA_HOST} placeholder="your-company.atlassian.net" />
      <small>Without https:// — e.g. <code>oreillyauto.atlassian.net</code></small>
    </label>
    <label>Company Email <span class="required">*</span>
      <input type="email" bind:value={fields.JIRA_EMAIL} placeholder="you@company.com" />
    </label>
    <label>Atlassian API Token <span class="required">*</span>
      <input type="password" bind:value={fields.JIRA_TOKEN} placeholder="Your API token" />
      <small><a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener">Generate token ↗</a></small>
    </label>
    <label>HTTP Port
      <input type="number" bind:value={fields.HTTP_PORT} placeholder="3847" />
    </label>
  </div>
  {/if}

  {#if activeTab === 'jira'}
  <div class="config-section">
    <h2>Jira Settings</h2>
    <label>Epic / Project filter <span class="optional">optional</span>
      <input type="text" bind:value={fields.JIRA_EPIC} placeholder="B2B-123 or project = B2B" />
      <small>Epic key or JQL — cache only indexes tickets under this scope</small>
    </label>
    <div class="branch-config">
      <label>Base Branches</label>
      <div class="branch-input-row">
        <input type="text" bind:value={branchInput} placeholder="e.g. develop"
          on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); baseBranches = addChip(baseBranches, branchInput); branchInput = ''; } }} />
        <button type="button" on:click={() => { baseBranches = addChip(baseBranches, branchInput); branchInput = ''; }}>Add</button>
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
      <small>Prefix for feature branches (e.g. <code>task/</code>, <code>feature/</code>)</small>
    </label>
  </div>
  {/if}

  {#if activeTab === 'bitbucket'}
  <div class="config-section">
    <h2>Bitbucket Settings</h2>
    <label>Workspace <span class="optional">optional</span>
      <input type="text" bind:value={fields.BITBUCKET_WORKSPACE} placeholder="your-workspace-slug" />
      <small>Found in: <code>bitbucket.org/<strong>this-part</strong>/...</code></small>
    </label>

    <div class="branch-config">
      <label>Project Keys filter <span class="optional">optional</span></label>
      <small>Leave empty to load all workspace repos.</small>
      <div class="branch-input-row">
        <input type="text" bind:value={bprojInput} placeholder="e.g. DIGCOM"
          on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bitbucketProjects = addChip(bitbucketProjects, bprojInput, true); bprojInput = ''; } }} />
        <button type="button" on:click={() => { bitbucketProjects = addChip(bitbucketProjects, bprojInput, true); bprojInput = ''; }}>Add</button>
      </div>
      {#if bitbucketProjects.length}
        <ul class="branch-tags">
          {#each bitbucketProjects as p, i}
            <li><span>{p}</span><button type="button" on:click={() => { bitbucketProjects = bitbucketProjects.filter((_, j) => j !== i); }}>&times;</button></li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="debug-section">
      <div class="debug-header">
        <span>All workspace projects</span>
        <button type="button" class="secondary small" on:click={testBitbucketProjects} disabled={bbProjLoading}>
          {bbProjLoading ? 'Loading…' : '↺ Load'}
        </button>
      </div>
      {#if bbProjError}<p class="debug-error">{bbProjError}</p>{/if}
      {#if bbProjects.length}
        <div class="debug-search">
          <input type="text" bind:value={bbProjSearch} placeholder="Filter projects…" />
        </div>
        <ul class="debug-list">
          {#each bbProjects.filter(p => !bbProjSearch || p.key.toLowerCase().includes(bbProjSearch.toLowerCase()) || p.name.toLowerCase().includes(bbProjSearch.toLowerCase())) as p}
            <li>
              <code>{p.key}</code> {p.name}
              <button type="button" class="chip-add" title="Add to filter"
                on:click={() => { bitbucketProjects = addChip(bitbucketProjects, p.key, true); }}>+</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="debug-section">
      <div class="debug-header">
        <span>Repos (current project filter)</span>
        <button type="button" class="secondary small" on:click={testBitbucketRepos} disabled={bbLoading}>
          {bbLoading ? 'Loading…' : '↺ Load'}
        </button>
      </div>
      {#if bbError}<p class="debug-error">{bbError}</p>{/if}
      {#if bbRepos.length}
        <div class="debug-search">
          <input type="text" bind:value={bbRepoSearch} placeholder="Filter repos…" />
        </div>
        <ul class="debug-list">
          {#each bbRepos.filter(r => !bbRepoSearch || r.slug.toLowerCase().includes(bbRepoSearch.toLowerCase()) || r.name.toLowerCase().includes(bbRepoSearch.toLowerCase())) as r}
            <li><code>{r.slug}</code> {r.name}{r.project ? ` · ${r.project}` : ''}</li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
  {/if}

  {#if activeTab === 'confluence'}
  <div class="config-section">
    <h2>Confluence Settings</h2>

    {#if confluenceSpaces.length}
      <div class="branch-config">
        <label>Space Keys filter</label>
        <ul class="branch-tags">
          {#each confluenceSpaces as s, i}
            <li><span>{s}</span><button type="button" on:click={() => { confluenceSpaces = confluenceSpaces.filter((_, j) => j !== i); }}>&times;</button></li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="hint">No spaces filtered — all global spaces will be indexed. Load the list below and click <strong>+</strong> to add.</p>
    {/if}

    <div class="debug-section">
      <div class="debug-header">
        <span>Available global spaces</span>
        <button type="button" class="secondary small" on:click={testConfluenceSpaces} disabled={cfLoading}>
          {cfLoading ? 'Loading…' : '↺ Load'}
        </button>
      </div>
      {#if cfError}<p class="debug-error">{cfError}</p>{/if}
      {#if cfSpaces.length}
        <div class="debug-search">
          <input type="text" bind:value={cfSearch} placeholder="Filter spaces…" />
          <span class="debug-count">{cfSpaces.filter(s => !cfSearch || s.key.toLowerCase().includes(cfSearch.toLowerCase()) || s.name.toLowerCase().includes(cfSearch.toLowerCase())).length} / {cfSpaces.length}</span>
        </div>
        <ul class="debug-list">
          {#each cfSpaces.filter(s => !cfSearch || s.key.toLowerCase().includes(cfSearch.toLowerCase()) || s.name.toLowerCase().includes(cfSearch.toLowerCase())) as s}
            <li>
              <code>{s.key}</code> {s.name}
              <button type="button" class="chip-add" title="Add to filter"
                on:click={() => { confluenceSpaces = addChip(confluenceSpaces, s.key, true); }}>+</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
  {/if}

  <div class="form-actions">
    <button type="submit">Save .env</button>
    {#if status}
      <span style="font-size:0.85rem; color: {statusOk ? 'var(--success)' : 'var(--danger)'}">{status}</span>
    {/if}
  </div>

</form>
