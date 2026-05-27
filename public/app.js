// ── Atlassian MCP — UI Application ──────────────────────────────────────────
const BASE = window.location.origin;
let allTools = [];
let aiSession = null;
let currentAiMode = 'jql';

// ── Tab Navigation ──────────────────────────────────────────────────────────
document.querySelectorAll('[data-tab]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('[data-tab]').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(`tab-${link.dataset.tab}`).classList.add('active');
  });
});

// ── Dashboard ───────────────────────────────────────────────────────────────
async function refreshDashboard() {
  try {
    const res = await fetch(`${BASE}/health`);
    const data = await res.json();
    document.getElementById('dash-url').textContent = BASE;
    document.getElementById('dash-tools').textContent = data.tools;
    document.getElementById('dash-uptime').textContent = formatUptime(data.uptime);
    document.querySelector('.status-dot').classList.remove('error');
    document.getElementById('status-text').textContent = 'Connected';
  } catch {
    document.querySelector('.status-dot').classList.add('error');
    document.getElementById('status-text').textContent = 'Disconnected';
  }
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ── Quick Test ──────────────────────────────────────────────────────────────
document.getElementById('btn-health').addEventListener('click', async () => {
  const res = await fetch(`${BASE}/health`);
  const data = await res.json();
  document.getElementById('quick-output').textContent = JSON.stringify(data, null, 2);
});

document.getElementById('btn-list-tools').addEventListener('click', async () => {
  const data = await rpcCall('tools/list', {});
  document.getElementById('quick-output').textContent = data.tools.map(t => t.name).join('\n');
});

// ── Configuration — .env ────────────────────────────────────────────────────
async function loadEnvConfig() {
  try {
    const res = await fetch(`${BASE}/api/config`);
    const data = await res.json();
    const form = document.getElementById('form-env');
    for (const [key, value] of Object.entries(data)) {
      const input = form.querySelector(`[name="${key}"]`);
      if (input) input.value = value;
    }
  } catch {}
}

document.getElementById('form-env').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  try {
    const res = await fetch(`${BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    const status = document.getElementById('env-status');
    if (result.ok) {
      status.textContent = '✓ Saved! Restart server to apply changes.';
      status.style.color = 'var(--success)';
    } else {
      status.textContent = `✗ ${result.error}`;
      status.style.color = 'var(--danger)';
    }
    setTimeout(() => { status.textContent = ''; }, 5000);
  } catch (err) {
    document.getElementById('env-status').textContent = `✗ ${err.message}`;
  }
});

// ── Configuration — config.json (copy to clipboard) ─────────────────────────
document.getElementById('btn-copy-config').addEventListener('click', () => {
  const form = document.getElementById('form-project');
  const branches = form.querySelector('[name="baseBranches"]').value
    .split(',').map(b => b.trim()).filter(Boolean);
  const prefix = form.querySelector('[name="branchPrefix"]').value.trim() || 'task/';
  const config = JSON.stringify({ baseBranches: branches, branchPrefix: prefix }, null, 2);
  navigator.clipboard.writeText(config).then(() => {
    const status = document.getElementById('config-status');
    status.textContent = '✓ Copied! Paste into .agents/config.json in your working repo.';
    setTimeout(() => { status.textContent = ''; }, 5000);
  });
});

// ── Tools Explorer ──────────────────────────────────────────────────────────
async function loadTools() {
  const data = await rpcCall('tools/list', {});
  allTools = data.tools;
  renderToolsList(allTools);
}

function renderToolsList(tools) {
  const list = document.getElementById('tools-list');
  list.innerHTML = tools.map(t =>
    `<li data-tool="${t.name}">${t.name}</li>`
  ).join('');
  list.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => selectTool(li.dataset.tool));
  });
}

function selectTool(name) {
  const tool = allTools.find(t => t.name === name);
  if (!tool) return;

  document.querySelectorAll('#tools-list li').forEach(li => li.classList.remove('active'));
  document.querySelector(`#tools-list li[data-tool="${name}"]`)?.classList.add('active');

  document.getElementById('tool-detail-placeholder').classList.add('hidden');
  document.getElementById('tool-detail').classList.remove('hidden');
  document.getElementById('tool-name').textContent = tool.name;
  document.getElementById('tool-desc').textContent = tool.description;
  document.getElementById('tool-response').textContent = '';

  const paramsForm = document.getElementById('tool-params');
  const props = tool.inputSchema?.properties || {};
  const required = tool.inputSchema?.required || [];

  paramsForm.innerHTML = Object.entries(props).map(([key, schema]) => `
    <label>${key} ${required.includes(key) ? '<span class="required">*</span>' : '<span class="optional">optional</span>'}
      <input type="text" name="${key}" placeholder="${schema.description || ''}">
    </label>
  `).join('');

  if (Object.keys(props).length === 0) {
    paramsForm.innerHTML = '<p class="hint">No parameters required</p>';
  }
}

document.getElementById('btn-execute-tool').addEventListener('click', async () => {
  const name = document.getElementById('tool-name').textContent;
  const form = document.getElementById('tool-params');
  const args = {};
  form.querySelectorAll('input').forEach(input => {
    if (input.value.trim()) {
      // Try to parse as number or JSON
      const v = input.value.trim();
      if (!isNaN(v) && v !== '') args[input.name] = Number(v);
      else if (v.startsWith('[') || v.startsWith('{')) {
        try { args[input.name] = JSON.parse(v); } catch { args[input.name] = v; }
      }
      else args[input.name] = v;
    }
  });

  document.getElementById('tool-response').textContent = 'Executing…';
  try {
    const result = await rpcCall('tools/call', { name, arguments: args });
    const text = result.content?.[0]?.text || JSON.stringify(result, null, 2);
    document.getElementById('tool-response').textContent = text;
  } catch (err) {
    document.getElementById('tool-response').textContent = `Error: ${err.message}`;
  }
});

// Tools search & filter
document.getElementById('tools-search').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filter = document.querySelector('.tools-filters .filter.active')?.dataset.filter || 'all';
  const filtered = allTools.filter(t => {
    const matchesSearch = t.name.includes(q) || t.description.toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || t.name.startsWith(filter);
    return matchesSearch && matchesFilter;
  });
  renderToolsList(filtered);
});

document.querySelectorAll('.tools-filters .filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tools-filters .filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tools-search').dispatchEvent(new Event('input'));
  });
});

// ── AI Assistant (LanguageModel API — Chrome/Edge built-in) ─────────────────
const aiTab = document.querySelector('[data-tab="ai"]');

async function initAI() {
  const dashAi = document.getElementById('dash-ai');
  const unavailableEl = document.getElementById('ai-unavailable');
  const availableEl = document.getElementById('ai-available');
  const statusEl = document.getElementById('ai-status-detail');

  try {
    // Strictly use the LanguageModel global — legacy window.ai is deprecated
    if (typeof LanguageModel === 'undefined') {
      throw new Error('LanguageModel API not found. The browser flags are not enabled or the browser version is unsupported.');
    }

    // Check availability state
    const availability = await LanguageModel.availability();

    if (availability === 'available') {
      // Model is ready
      unavailableEl.classList.add('hidden');
      availableEl.classList.remove('hidden');
      dashAi.textContent = 'Available';
      dashAi.style.color = 'var(--success)';
      aiTab.style.display = '';
      aiTab.style.opacity = '';
      aiTab.title = '';
      return;
    }

    if (availability === 'downloading') {
      // Model weights are being downloaded right now
      dashAi.textContent = 'Downloading…';
      dashAi.style.color = 'var(--warning)';
      if (statusEl) statusEl.textContent = 'The browser is currently downloading the local AI model (Phi-mini/Gemini Nano). Please wait a few minutes and refresh this page.';
      throw new Error('downloading');
    }

    if (availability === 'downloadable') {
      // API present but ~3-4 GB model weights are missing.
      // Trigger silent download by invoking create() — this wakes up the download engine.
      dashAi.textContent = 'Triggering download…';
      dashAi.style.color = 'var(--warning)';
      try {
        await LanguageModel.create({ expectedInputLanguages: ['es'], outputLanguage: 'es' });
      } catch (e) { /* expected to fail while downloading */ }
      if (statusEl) statusEl.textContent = 'Download requested. Monitor chrome://components or edge://components → "Optimization Guide On Device Model". Refresh this page when complete.';
      throw new Error('downloadable');
    }

    // Unknown state
    throw new Error(`Unexpected availability state: "${availability}"`);
  } catch (err) {
    unavailableEl.classList.remove('hidden');
    availableEl.classList.add('hidden');
    if (!dashAi.textContent.includes('ownload')) {
      dashAi.textContent = 'Not enabled';
      dashAi.style.color = 'var(--text-dim)';
    }
    aiTab.style.opacity = '0.5';
    aiTab.title = 'Requires Chrome/Edge built-in AI model';
  }
}

document.querySelectorAll('.ai-mode').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ai-mode').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentAiMode = btn.dataset.mode;
    aiSession = null; // reset session for new mode
    updateAiPlaceholder();
  });
});

// Helper: validate LanguageModel is accessible (no legacy fallbacks)
function assertLanguageModel() {
  if (typeof LanguageModel === 'undefined') {
    throw new Error('LanguageModel API not available. See the AI Assistant tab for setup instructions.');
  }
  return LanguageModel;
}

function updateAiPlaceholder() {
  const placeholders = {
    jql: 'Describe what tickets you want to find… (e.g. "open bugs in project ACME assigned to me")',
    cql: 'Describe what documentation you\'re looking for… (e.g. "deployment guides in the ENG space")',
    summarize: 'Paste text to summarize (e.g. a long Jira ticket description or Confluence page)…',
    chat: 'Ask anything about your project workflow…'
  };
  document.getElementById('ai-prompt').placeholder = placeholders[currentAiMode] || '';
}

document.getElementById('btn-ai-send').addEventListener('click', sendAiMessage);
document.getElementById('ai-prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
});

async function sendAiMessage() {
  const input = document.getElementById('ai-prompt');
  const text = input.value.trim();
  if (!text) return;

  addAiMessage('user', text);
  input.value = '';

  try {
    if (!aiSession) {
      assertLanguageModel();

      const systemPrompts = {
        jql: 'You are a JQL (Jira Query Language) expert. Convert the user\'s natural language description into a valid JQL query. Return ONLY the JQL query, no explanation. Examples: "open bugs in ACME" → project = ACME AND type = Bug AND status != Done. "my tasks this sprint" → assignee = currentUser() AND sprint in openSprints().',
        cql: 'You are a CQL (Confluence Query Language) expert. Convert the user\'s natural language description into a valid CQL query. Return ONLY the CQL query, no explanation. Examples: "deployment docs in ENG space" → type = page AND space = ENG AND text ~ "deployment". "recently modified API docs" → type = page AND text ~ "API" ORDER BY lastmodified DESC.',
        summarize: 'You are a concise technical summarizer. Summarize the provided text into bullet points highlighting: key decisions, action items, and important details. Keep it under 5 bullet points.',
        chat: 'You are a helpful assistant for a software development team using Atlassian tools (Jira, Confluence, Bitbucket). Help with workflow questions, JQL/CQL queries, git branching strategies, and general development practices. Be concise.'
      };

      // Always pass explicit language config to avoid safety filter blocking
      // in non-English contexts (Gemini Nano / Phi-mini silently fail otherwise)
      aiSession = await LanguageModel.create({
        systemPrompt: systemPrompts[currentAiMode],
        expectedInputLanguages: ['es', 'en'],
        outputLanguage: 'en'
      });
    }

    // Use promptStreaming for resilient output.
    // CRITICAL: stream returns RAW DELTAS (token fragments), NOT cumulative text.
    // Must concatenate with += (never overwrite with =).
    const stream = await aiSession.promptStreaming(text);
    let accumulated = '';
    const msgEl = addAiMessage('assistant', '▍'); // placeholder with cursor

    for await (const chunk of stream) {
      accumulated += chunk; // delta concatenation — do NOT trim or overwrite
      updateAiMessage(msgEl, accumulated + '▍');
    }

    // Final render without cursor
    updateAiMessage(msgEl, accumulated || '(empty response)');
  } catch (err) {
    addAiMessage('assistant', `Error: ${err.message}. Make sure the built-in AI model is enabled in your browser.`);
  }
}

function addAiMessage(role, text) {
  const container = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `ai-msg ${role}`;
  renderAiContent(div, text, role);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div; // return element for streaming updates
}

function updateAiMessage(el, text) {
  renderAiContent(el, text, 'assistant');
  const container = document.getElementById('ai-messages');
  container.scrollTop = container.scrollHeight;
}

function renderAiContent(el, text, role) {
  // Simple markdown-ish formatting for code blocks
  if (text.includes('```')) {
    const parts = text.split(/```(\w*)\n?/);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) html += escapeHtml(parts[i]);
      else { html += `<pre>${escapeHtml(parts[i + 1] || '')}</pre>`; i++; }
    }
    el.innerHTML = html;
  } else if (role === 'assistant' && !text.startsWith('Error')) {
    el.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
  } else {
    el.textContent = text;
  }
}
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── JSON-RPC helper ─────────────────────────────────────────────────────────
async function rpcCall(method, params) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ── Init ────────────────────────────────────────────────────────────────────
(async function init() {
  refreshDashboard();
  loadEnvConfig();
  loadTools();
  initAI();
  updateAiPlaceholder();
  setInterval(refreshDashboard, 10000);
})();
