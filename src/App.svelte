<script lang="ts">
  import { onMount } from 'svelte';
  import { getConfig, getHealth, getBitbucketRepos } from './lib/api';
  import { configured, serverConnected, workspaceRepos } from './lib/stores';
  import Dashboard from './routes/Dashboard.svelte';
  import Config from './routes/Config.svelte';
  import Tools from './routes/Tools.svelte';
  import AI from './routes/AI.svelte';
  import Cache from './routes/Cache.svelte';

  const ALL_TABS = ['dashboard', 'config', 'tools', 'ai', 'cache'];
  let tab = 'config';
  let aiEnabled = false;

  function go(t: string) {
    tab = t;
    history.replaceState(null, '', `#${t}`);
  }

  onMount(async () => {
    window.addEventListener('hashchange', () => {
      const h = location.hash.replace('#', '');
      if (ALL_TABS.includes(h)) tab = h;
    });

    try {
      const cfg = await getConfig();
      const ok =
        !!cfg.JIRA_HOST && !cfg.JIRA_HOST.includes('your-company') &&
        !!cfg.JIRA_EMAIL && !cfg.JIRA_EMAIL.includes('yourcompany') &&
        cfg.JIRA_TOKEN === '••••••••';
      configured.set(ok);
      const hash = location.hash.replace('#', '');
      tab = ok ? (ALL_TABS.includes(hash) ? hash : 'dashboard') : 'config';
    } catch {
      tab = 'config';
    }

    try {
      await getHealth();
      serverConnected.set(true);
    } catch {
      serverConnected.set(false);
    }

    // Pre-load workspace repos for Cache tab multi-select
    try {
      const repos = await getBitbucketRepos();
      workspaceRepos.set(repos);
    } catch {}

    // AI availability
    try {
      // @ts-ignore
      if (typeof LanguageModel !== 'undefined') {
        // @ts-ignore
        const avail = await LanguageModel.availability();
        aiEnabled = avail === 'available';
      }
    } catch {}
  });
</script>

<nav>
  <div class="nav-brand">⚡ Atlassian MCP</div>
  <div class="nav-links">
    {#if $configured}
      {#each ALL_TABS as t}
        {#if t !== 'ai' || aiEnabled}
          <a
            href="#{t}"
            class:active={tab === t}
            on:click|preventDefault={() => go(t)}
          >{t.charAt(0).toUpperCase() + t.slice(1)}</a>
        {/if}
      {/each}
    {:else}
      <a href="#config" class:active={tab === 'config'} on:click|preventDefault={() => go('config')}>Configuration</a>
    {/if}
  </div>
  <div class="nav-status">
    <span class="status-dot" class:error={!$serverConnected}></span>
    <span>{$serverConnected ? 'Connected' : 'Disconnected'}</span>
  </div>
</nav>

<main>
  {#if tab === 'dashboard'}  <Dashboard on:navigate={(e) => go(e.detail)} />
  {:else if tab === 'config'}  <Config />
  {:else if tab === 'tools'}   <Tools />
  {:else if tab === 'ai'}      <AI />
  {:else if tab === 'cache'}   <Cache />
  {/if}
</main>
