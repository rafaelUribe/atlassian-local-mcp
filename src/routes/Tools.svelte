<script lang="ts">
  import { onMount } from 'svelte';
  import { rpcCall } from '../lib/api';
  import type { Tool } from '../lib/types';

  let allTools: Tool[] = [];
  let search = '';
  let activeFilter = 'all';
  let selectedTool: Tool | null = null;
  let paramValues: Record<string, string> = {};
  let response = '';
  let executing = false;

  $: filtered = allTools.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase());
    const matchFilter = activeFilter === 'all' || t.name.startsWith(activeFilter);
    return matchSearch && matchFilter;
  });

  function selectTool(tool: Tool) {
    selectedTool = tool;
    paramValues = {};
    response = '';
  }

  async function executeTool() {
    if (!selectedTool) return;
    executing = true;
    response = 'Executing…';
    try {
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(paramValues)) {
        if (!v.trim()) continue;
        if (!isNaN(Number(v))) args[k] = Number(v);
        else if (v.startsWith('[') || v.startsWith('{')) {
          try { args[k] = JSON.parse(v); } catch { args[k] = v; }
        } else {
          args[k] = v;
        }
      }
      const result = await rpcCall<{ content?: { text: string }[] }>('tools/call', { name: selectedTool.name, arguments: args });
      response = result.content?.[0]?.text ?? JSON.stringify(result, null, 2);
    } catch (err: unknown) {
      response = `Error: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      executing = false;
    }
  }

  onMount(async () => {
    const data = await rpcCall<{ tools: Tool[] }>('tools/list', {});
    allTools = data.tools;
  });
</script>

<h1>Tools Explorer</h1>

<div class="tools-layout">
  <div class="tools-sidebar">
    <input type="text" bind:value={search} placeholder="Search tools…" id="tools-search" />
    <div class="tools-filters">
      {#each ['all', 'jira', 'confluence', 'bitbucket'] as f}
        <button
          class="filter"
          class:active={activeFilter === f}
          on:click={() => { activeFilter = f; }}
        >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
      {/each}
    </div>
    <ul id="tools-list">
      {#each filtered as tool}
        <li
          class:active={selectedTool?.name === tool.name}
          on:click={() => selectTool(tool)}
          role="option"
          aria-selected={selectedTool?.name === tool.name}
          tabindex="0"
          on:keydown={(e) => { if (e.key === 'Enter') selectTool(tool); }}
        >
          <strong>{tool.name}</strong>
          <span class="tool-desc">{tool.description}</span>
        </li>
      {/each}
    </ul>
  </div>

  <div class="tools-detail">
    {#if !selectedTool}
      <div id="tool-detail-placeholder"><p>← Select a tool to see details and try it</p></div>
    {:else}
      <h2>{selectedTool.name}</h2>
      <p>{selectedTool.description}</p>

      {#if Object.keys(selectedTool.inputSchema?.properties ?? {}).length}
        <h3>Parameters</h3>
        <div id="tool-params">
          {#each Object.entries(selectedTool.inputSchema?.properties ?? {}) as [key, schema]}
            {@const required = selectedTool.inputSchema?.required?.includes(key)}
            <label>
              {key}
              {#if required}<span class="required">*</span>{:else}<span class="optional">optional</span>{/if}
              <input
                type="text"
                bind:value={paramValues[key]}
                placeholder={schema.description ?? ''}
              />
            </label>
          {/each}
        </div>
      {:else}
        <p class="hint">No parameters required</p>
      {/if}

      <button on:click={executeTool} disabled={executing}>
        {executing ? 'Executing…' : 'Execute'}
      </button>

      {#if response}
        <h3>Response</h3>
        <pre id="tool-response">{response}</pre>
      {/if}
    {/if}
  </div>
</div>
