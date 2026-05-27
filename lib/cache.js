const fs   = require('fs');
const path = require('path');
const { ROOT } = require('./config');

const TICKETS_DIR = path.join(ROOT, 'cache', 'tickets');
const META_FILE   = path.join(ROOT, 'cache', 'meta.json');
const LEGACY_FILE = path.join(ROOT, 'cache', 'mcp-cache.json');

// ── Per-ticket helpers ────────────────────────────────────────────────────────
function _ticketPath(id) { return path.join(TICKETS_DIR, `${id}.json`); }

function _ticketLoad(id) {
  try { return JSON.parse(fs.readFileSync(_ticketPath(id), 'utf8')); }
  catch { return {}; }
}

function _ticketSave(id, data) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
  const tmp = _ticketPath(id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, _ticketPath(id));
}

// ── Meta (config) helpers ─────────────────────────────────────────────────────
function _metaLoad() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
  catch { return {}; }
}

function _metaSave(data) {
  fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
  const tmp = META_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, META_FILE);
}

// ── One-time migration from legacy mcp-cache.json ────────────────────────────
function _migrateLegacy() {
  if (!fs.existsSync(LEGACY_FILE)) return;
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
  let legacy;
  try { legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8')); } catch { return; }
  let count = 0;
  for (const [id, data] of Object.entries(legacy.tickets || {})) {
    if (!fs.existsSync(_ticketPath(id))) {
      _ticketSave(id, data);
      count++;
    }
  }
  // Migrate config to meta.json
  if (legacy.config) {
    const meta = _metaLoad();
    if (!meta.config) { _metaSave({ ...meta, config: legacy.config }); }
  }
  if (count > 0) process.stderr.write(`[cache] Migrated ${count} ticket(s) from mcp-cache.json\n`);
  // Rename legacy file so migration doesn't re-run
  try { fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.migrated'); } catch {}
}

_migrateLegacy();

// ── Seed active tickets from env (legacy support) ────────────────────────────
function _seedFromEnv() {
  const ids = (process.env.ACTIVE_TICKETS || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  for (const id of ids) {
    if (!fs.existsSync(_ticketPath(id))) _ticketSave(id, {});
  }
}
_seedFromEnv();

// ── Public API ────────────────────────────────────────────────────────────────
const FILE_TO_KEY = {
  'context.json': 'context', 'repos.json': 'repos', 'articles.json': 'articles',
  'related.json': 'related', 'pinned.json': 'pinned', 'timeline.json': 'timeline', 'links.json': 'links',
};

function cacheRead(ticketId, file) {
  const key = FILE_TO_KEY[file];
  return key ? (_ticketLoad(ticketId)[key] ?? null) : null;
}

function cacheWrite(ticketId, file, data) {
  const key = FILE_TO_KEY[file];
  if (!key) return;
  const t = _ticketLoad(ticketId);
  t[key] = data;
  _ticketSave(ticketId, t);
}

function cacheAppendTimeline(ticketId, entry) {
  const t = _ticketLoad(ticketId);
  const tl = t.timeline || [];
  tl.unshift({ ...entry, date: new Date().toISOString() });
  t.timeline = tl.slice(0, 50); // keep last 50 only
  _ticketSave(ticketId, t);
}

function cacheRemoveTicket(ticketId) {
  try { fs.unlinkSync(_ticketPath(ticketId)); } catch {}
}

function cacheAddLink(ticketId, link) {
  const t = _ticketLoad(ticketId);
  const links = t.links || [];
  links.push({ ...link, id: Date.now().toString(), addedAt: new Date().toISOString() });
  t.links = links;
  _ticketSave(ticketId, t);
}

function cacheRemoveLink(ticketId, linkId) {
  const t = _ticketLoad(ticketId);
  if (!t.links) return;
  t.links = t.links.filter(l => l.id !== linkId);
  _ticketSave(ticketId, t);
}

function getActiveTickets() {
  try {
    return fs.readdirSync(TICKETS_DIR)
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => f.replace('.json', ''));
  } catch { return []; }
}

function getDb() {
  // Legacy compat: returns shape { tickets: { [id]: data } }
  const tickets = {};
  for (const id of getActiveTickets()) tickets[id] = _ticketLoad(id);
  return { tickets };
}

function getDbConfig() { return _metaLoad().config || null; }

function saveDbConfig(cfgObj) {
  const meta = _metaLoad();
  meta.config = { ...(meta.config || {}), ...cfgObj };
  _metaSave(meta);
}

function formatTicketContext(ticketId) {
  const ctx   = cacheRead(ticketId, 'context.json');
  const repos = cacheRead(ticketId, 'repos.json')    || [];
  const arts  = cacheRead(ticketId, 'articles.json') || [];
  const rel   = cacheRead(ticketId, 'related.json')  || [];
  const tl    = cacheRead(ticketId, 'timeline.json') || [];
  if (!ctx) return `No cached context for ${ticketId}. Run mcp_index_ticket first.`;
  const j = ctx.jira;
  const lines = [
    `# ${ticketId} — ${j.summary}`,
    `**Status:** ${j.status} | **Priority:** ${j.priority} | **Type:** ${j.issueType}`,
    `**Assignee:** ${j.assignee || 'Unassigned'} | **Reporter:** ${j.reporter}`,
    j.epic              ? `**Epic:** ${j.epic}` : '',
    j.labels?.length    ? `**Labels:** ${j.labels.join(', ')}` : '',
    j.components?.length ? `**Components:** ${j.components.join(', ')}` : '',
    `**Last indexed:** ${ctx.indexedAt?.slice(0, 10)}`, '',
    j.description ? `## Description\n${j.description.slice(0, 800)}${j.description.length > 800 ? '...' : ''}` : '',
  ];
  if (rel.length)  { lines.push('\n## Related Tickets');   rel.forEach(r => lines.push(`- **${r.key}** [${r.status}] ${r.summary} (${r.assignee || 'unassigned'})`)); }
  if (repos.length) {
    lines.push('\n## Bitbucket — Branches & PRs');
    repos.forEach(r => {
      lines.push(`### ${r.repo}`);
      r.branches.forEach(b => lines.push(`  - branch: \`${b.name}\` (${b.target?.date?.slice(0, 10) || '?'})`));
      (r.prs || []).forEach(p => lines.push(`  - PR #${p.id}: ${p.title} [${p.state}]`));
    });
  }
  if (arts.length) { lines.push('\n## Confluence Articles (top matches)'); arts.slice(0, 8).forEach(a => lines.push(`- [${a.title}](${a.url}) — space: ${a.spaceKey || a.space}`)); }
  if (tl.length)   { lines.push('\n## Timeline (recent)'); tl.slice(0, 5).forEach(e => lines.push(`- **${e.date?.slice(0, 16)}** [${e.type}] ${e.summary}`)); }
  const links = cacheRead(ticketId, 'links.json') || [];
  if (links.length) { lines.push('\n## Manual Context Links'); links.forEach(l => lines.push(`- [${l.type || 'link'}] ${l.title ? l.title + ' — ' : ''}${l.url}`)); }
  return lines.filter(l => l !== '').join('\n');
}

module.exports = { cacheRead, cacheWrite, cacheAppendTimeline, cacheRemoveTicket, cacheAddLink, cacheRemoveLink, getActiveTickets, getDb, getDbConfig, saveDbConfig, formatTicketContext };
