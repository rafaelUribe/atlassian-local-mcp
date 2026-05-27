<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getCachedTickets, getBitbucketRepos, toolCall, pinRepos } from '../lib/api';
  import { workspaceRepos } from '../lib/stores';
  import type { CachedTicketSummary } from '../lib/types';

  let tickets: CachedTicketSummary[] = [];
  let repos = $workspaceRepos;
  let expandedId: string | null = null;
  let indexInput = '';
  let indexing = false;
  let syncing = false;
  let indexStatus = '';
  let syncStatus = '';
  // pinnedRepos[ticketId] = array of manually pinned repo slugs
  let localPinned: Record<string, string[]> = {};

  async function loadTickets() {
    tickets = await getCachedTickets();
    // Initialize local pinned state from cache
    for (const t of tickets) {
      if (!localPinned[t.id]) {
        localPinned[t.id] = [...(t.pinned ?? [])];
      }
    }
  }

  async function indexTicket() {
    const id = indexInput.trim().toUpperCase();
    if (!id) return;
    indexing = true;
    indexStatus = `Indexing ${id}…`;
    try {
      await toolCall('mcp_index_ticket', { ticketId: id });
      indexStatus = `✓ ${id} indexed`;
      indexInput = '';
      await loadTickets();
      expandedId = id;
    } catch (err: unknown) {
      indexStatus = `✗ ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      indexing = false;
      setTimeout(() => { indexStatus = ''; }, 4000);
    }
  }

  async function syncAll() {
    syncing = true;
    syncStatus = 'Syncing…';
    try {
      const result = await toolCall<{ content: { text: string }[] }>('mcp_sync_active_tickets', {});
      syncStatus = '✓ ' + (result.content?.[0]?.text?.split('\n')[0] ?? 'Done');
      await loadTickets();
    } catch (err: unknown) {
      syncStatus = `✗ ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      syncing = false;
      setTimeout(() => { syncStatus = ''; }, 5000);
    }
  }

  function isRepoActive(ticketId: string, repoSlug: string, ticket: CachedTicketSummary): boolean {
    const autoDiscovered = ticket.repos.some(r => r.repo === repoSlug);
    const pinned = localPinned[ticketId]?.includes(repoSlug) ?? false;
    return autoDiscovered || pinned;
  }

  function isAutoDiscovered(repoSlug: string, ticket: CachedTicketSummary): boolean {
    return ticket.repos.some(r => r.repo === repoSlug);
  }

  async function toggleRepo(ticketId: string, repoSlug: string, ticket: CachedTicketSummary) {
    // Can't toggle auto-discovered ones (they're always on)
    if (isAutoDiscovered(repoSlug, ticket)) return;
    const current = localPinned[ticketId] ?? [];
    if (current.includes(repoSlug)) {
      localPinned[ticketId] = current.filter(r => r !== repoSlug);
    } else {
      localPinned[ticketId] = [...current, repoSlug];
    }
    localPinned = { ...localPinned }; // trigger reactivity
    await pinRepos(ticketId, localPinned[ticketId]);
  }

  function statusClass(status: string): string {
    const s = (status ?? '').toLowerCase();
    if (s.includes('progress') || s.includes('review')) return 'in-progress';
    if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'done';
    return '';
  }

  onMount(async () => {
    await loadTickets();
    if (!repos.length) {
      repos = await getBitbucketRepos();
      workspaceRepos.set(repos);
    }
  });

  const unsubRepos = workspaceRepos.subscribe(r => { repos = r; });
  onDestroy(unsubRepos);
</script>

<h1>Knowledge Cache</h1>

<div class="cache-toolbar">
  <input
    type="text"
    bind:value={indexInput}
    placeholder="B2BBE-123"
    on:keydown={(e) => { if (e.key === 'Enter') indexTicket(); }}
  />
  <button on:click={indexTicket} disabled={indexing}>
    {indexing ? 'Indexing…' : 'Index Ticket'}
  </button>
  <button class="secondary" on:click={syncAll} disabled={syncing}>
    {syncing ? 'Syncing…' : '↻ Sync Active Tickets'}
  </button>
  {#if indexStatus}<span style="font-size:0.85rem;color:var(--text-dim)">{indexStatus}</span>{/if}
  {#if syncStatus}<span style="font-size:0.85rem;color:var(--text-dim)">{syncStatus}</span>{/if}
</div>

{#if tickets.length === 0}
  <div class="cache-empty">
    <p>No tickets indexed yet.</p>
    <p style="margin-top:0.5rem;font-size:0.85rem">Enter a ticket key above and click <strong>Index Ticket</strong> to start.</p>
  </div>
{:else}
  {#each tickets as ticket}
    {@const jira = ticket.context?.jira}
    <div class="ticket-card">
      <!-- Header (click to expand) -->
      <div
        class="ticket-card-header"
        on:click={() => { expandedId = expandedId === ticket.id ? null : ticket.id; }}
        role="button"
        tabindex="0"
        on:keydown={(e) => { if (e.key === 'Enter') expandedId = expandedId === ticket.id ? null : ticket.id; }}
      >
        <span class="ticket-id">{ticket.id}</span>
        {#if jira}
          <span class="status-badge {statusClass(jira.status)}">{jira.status}</span>
          <span class="ticket-summary">{jira.summary}</span>
        {/if}
        <span class="ticket-meta">
          {ticket.repos.length} repos · {ticket.articles.length} articles · {ticket.related.length} related
        </span>
        <button class="expand-btn">{expandedId === ticket.id ? '▲' : '▼'}</button>
      </div>

      <!-- Expanded body -->
      {#if expandedId === ticket.id}
        <div class="ticket-card-body">

          {#if jira}
            <div class="ticket-section">
              <h4>Jira</h4>
              <div style="font-size:0.85rem;display:flex;flex-wrap:wrap;gap:0.5rem 1.5rem;color:var(--text-dim)">
                <span>Priority: <strong style="color:var(--text)">{jira.priority}</strong></span>
                <span>Assignee: <strong style="color:var(--text)">{jira.assignee ?? 'Unassigned'}</strong></span>
                <span>Type: <strong style="color:var(--text)">{jira.issueType}</strong></span>
                {#if jira.epic}<span>Epic: <strong style="color:var(--accent)">{jira.epic}</strong></span>{/if}
                <span>Comments: <strong style="color:var(--text)">{jira.commentsCount}</strong></span>
                <span>Indexed: <strong style="color:var(--text)">{ticket.context?.indexedAt?.slice(0,10)}</strong></span>
              </div>
              {#if jira.description}
                <p style="margin-top:0.6rem;font-size:0.85rem;color:var(--text-dim);line-height:1.5">{jira.description.slice(0, 300)}{jira.description.length > 300 ? '…' : ''}</p>
              {/if}
            </div>
          {/if}

          <!-- Repo multi-select -->
          <div class="ticket-section">
            <h4>Repos {#if repos.length}<span style="font-weight:400;color:var(--text-dim);font-size:0.75rem">— click to pin/unpin · auto-discovered shown in blue</span>{/if}</h4>
            <div class="repo-grid">
              {#each repos as repo}
                {@const auto = isAutoDiscovered(repo.slug, ticket)}
                {@const active = isRepoActive(ticket.id, repo.slug, ticket)}
                <button
                  class="repo-chip"
                  class:active
                  title={auto ? 'Auto-discovered (always included)' : active ? 'Pinned — click to remove' : 'Click to pin'}
                  on:click={() => toggleRepo(ticket.id, repo.slug, ticket)}
                >
                  {repo.slug}
                  {#if auto}<span class="auto-badge">auto</span>{/if}
                </button>
              {:else}
                <span style="font-size:0.85rem;color:var(--text-dim)">No workspace repos loaded.</span>
              {/each}
            </div>
          </div>

          <!-- Confluence articles -->
          {#if ticket.articles.length}
            <div class="ticket-section">
              <h4>Confluence Articles</h4>
              <div class="article-list">
                {#each ticket.articles as art}
                  <div class="article-item">
                    <a href={art.url} target="_blank" rel="noopener">{art.title}</a>
                    <span style="color:var(--text-dim);font-size:0.78rem"> — {art.space} · v{art.version} · {art.lastModified?.slice(0,10)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Related tickets -->
          {#if ticket.related.length}
            <div class="ticket-section">
              <h4>Related Tickets</h4>
              <div class="related-list">
                {#each ticket.related as rel}
                  <div class="article-item">
                    <strong style="color:var(--accent);font-family:var(--mono)">{rel.key}</strong>
                    <span class="status-badge {statusClass(rel.status)}" style="margin:0 0.4rem">{rel.status}</span>
                    <span>{rel.summary}</span>
                    <span style="color:var(--text-dim)"> ({rel.assignee ?? 'unassigned'})</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Timeline -->
          {#if ticket.timeline.length}
            <div class="ticket-section">
              <h4>Timeline</h4>
              <div class="timeline-list">
                {#each ticket.timeline.slice(0, 8) as entry}
                  <div class="timeline-entry">
                    <span class="timeline-date">{entry.date?.slice(0,16)}</span>
                    <span class="timeline-type">[{entry.type}]</span>
                    <span>{entry.summary}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

        </div>
      {/if}
    </div>
  {/each}
{/if}
