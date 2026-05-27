<script lang="ts">
  import { onMount } from 'svelte';

  type AiMode = 'jql' | 'cql' | 'summarize' | 'chat';
  let mode: AiMode = 'jql';
  let prompt = '';
  let messages: { role: 'user' | 'assistant'; text: string }[] = [];
  let available = false;
  let checking = true;
  // @ts-ignore
  let session: unknown = null;
  const modes: AiMode[] = ['jql', 'cql', 'summarize', 'chat'];

  const systemPrompts: Record<AiMode, string> = {
    jql: "You are a JQL expert. Convert the user's natural language to a valid JQL query. Return ONLY the JQL, no explanation.",
    cql: "You are a CQL expert. Convert the user's natural language to a valid Confluence CQL query. Return ONLY the CQL.",
    summarize: "Summarize the provided text in concise bullet points: key decisions, action items, important details. Max 5 bullets.",
    chat: "You are a helpful assistant for a software dev team using Atlassian tools (Jira, Confluence, Bitbucket). Be concise.",
  };

  const placeholders: Record<AiMode, string> = {
    jql: 'Describe what tickets you want to find…',
    cql: 'Describe what documentation you\'re looking for…',
    summarize: 'Paste text to summarize…',
    chat: 'Ask anything about your workflow…',
  };

  async function initAI() {
    try {
      // @ts-ignore
      if (typeof LanguageModel === 'undefined') throw new Error('not available');
      // @ts-ignore
      const avail = await LanguageModel.availability();
      available = avail === 'available';
    } catch { available = false; }
    checking = false;
  }

  async function send() {
    const text = prompt.trim();
    if (!text) return;
    messages = [...messages, { role: 'user', text }];
    prompt = '';
    const idx = messages.length; // index where assistant response will go
    messages = [...messages, { role: 'assistant', text: '▍' }];

    try {
      if (!session) {
        // @ts-ignore
        session = await LanguageModel.create({
          systemPrompt: systemPrompts[mode],
          expectedInputLanguages: ['es', 'en'],
          outputLanguage: 'en',
        });
      }
      // @ts-ignore
      const stream = await session.promptStreaming(text);
      let accumulated = '';
      for await (const chunk of stream) {
        accumulated += chunk;
        messages[idx] = { role: 'assistant', text: accumulated + '▍' };
        messages = [...messages];
      }
      messages[idx] = { role: 'assistant', text: accumulated || '(empty response)' };
    } catch (err: unknown) {
      messages[idx] = { role: 'assistant', text: `Error: ${err instanceof Error ? err.message : String(err)}` };
    }
    messages = [...messages];
  }

  function switchMode(m: AiMode) {
    mode = m;
    session = null;
  }

  onMount(initAI);
</script>

<h1>AI Assistant</h1>

{#if checking}
  <p class="hint">Checking local AI availability…</p>
{:else if !available}
  <div class="warning-box">
    <h3>Local AI model not detected</h3>
    <p>This feature uses the <strong>LanguageModel API</strong> — a local model (Gemini Nano / Phi-mini) running entirely in your browser.</p>
    <h4 style="margin-top:1rem">Google Chrome (127+)</h4>
    <ol style="margin-left:1.5rem;line-height:2">
      <li>Open <code>chrome://flags</code></li>
      <li>Enable <strong>Prompt API for Gemini Nano</strong></li>
      <li>Enable <strong>Optimization Guide On Device Model</strong></li>
      <li>Restart Chrome and refresh this page</li>
    </ol>
  </div>
{:else}
  <div class="ai-modes">
    {#each modes as m}
      <button class="ai-mode" class:active={mode === m} on:click={() => switchMode(m)}>
        {m.toUpperCase()}
      </button>
    {/each}
  </div>

  <div class="ai-chat">
    <div id="ai-messages">
      {#each messages as msg}
        <div class="ai-msg {msg.role}">
          {#if msg.role === 'assistant' && !msg.text.startsWith('Error')}
            <pre>{msg.text}</pre>
          {:else}
            {msg.text}
          {/if}
        </div>
      {/each}
    </div>
    <div class="ai-input">
      <textarea
        bind:value={prompt}
        placeholder={placeholders[mode]}
        rows="2"
        on:keydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
      ></textarea>
      <button on:click={send}>Send</button>
    </div>
  </div>
{/if}

<style>
  .warning-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    max-width: 600px;
  }
  ol { color: var(--text-dim); }
  code { background: var(--bg); padding: 0.15rem 0.4rem; border-radius: 4px; font-family: var(--mono); font-size: 0.8rem; }
</style>
