const fs   = require('fs');
const path = require('path');
const { ROOT } = require('./config');

const CACHE_FILE = path.join(ROOT, 'cache', 'mcp-cache.json');
const CACHE_DIR  = path.join(ROOT, 'cache', 'tickets'); // migration only

let _db = null;

function _dbLoad() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  try { _db = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { _db = { tickets: {} }; }
  _migrateJsonFiles();
  _seedFromEnv();
  return _db;
}

function _dbSave() {
  const tmp = CACHE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(_db, null, 2), 'utf8');
  fs.renameSync(tmp, CACHE_FILE);
}

function _migrateJsonFiles() {
  if (!fs.existsSync(CACHE_DIR)) return;
  const KEYS = ['context', 'repos', 'articles', 'related', 'pinned', 'timeline'];
  let migrated = 0;
  for (const id of fs.readdirSync(CACHE_DIR)) {
    if (!fs.statSync(path.join(CACHE_DIR, id)).isDirectory() || _db.tickets[id]) continue;
    _db.tickets[id] = {};
    for (const key of KEYS) {
      try { _db.tickets[id][key] = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, id, `${key}.json`), 'utf8')); }
      catch { /* file missing, skip */ }
    }
    migrated++;
  }
  if (migrated > 0) { _dbSave(); console.log(`[cache] Migrated ${migrated} ticket(s) from JSON files`); }
}

function _seedFromEnv() {
  const ids = (process.env.ACTIVE_TICKETS || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const toAdd = ids.filter(id => !_db.tickets[id]);
  if (!toAdd.length) return;
  toAdd.forEach(id => { _db.tickets[id] = {}; });
  _dbSave();
  console.log(`[cache] Seeded ${toAdd.length} ticket(s) from ACTIVE_TICKETS`);
}

const FILE_TO_KEY = {
  'context.json': 'context', 'repos.json': 'repos', 'articles.json': 'articles',
  'related.json': 'related', 'pinned.json': 'pinned', 'timeline.json': 'timeline', 'links.json': 'links',
};

function cacheRead(ticketId, file) {
  const key = FILE_TO_KEY[file];
  return key ? (_dbLoad().tickets[ticketId]?.[key] ?? null) : null;
}

function cacheWrite(ticketId, file, data) {
  const db = _dbLoad(), key = FILE_TO_KEY[file];
  if (!key) return;
  if (!db.tickets[ticketId]) db.tickets[ticketId] = {};
  db.tickets[ticketId][key] = data;
  _dbSave();
}

function cacheAppendTimeline(ticketId, entry) {
  const db = _dbLoad();
  if (!db.tickets[ticketId]) db.tickets[ticketId] = {};
  const tl = db.tickets[ticketId].timeline || [];
  tl.unshift({ ...entry, date: new Date().toISOString() });
  db.tickets[ticketId].timeline = tl.slice(0, 200);
  _dbSave();
}

function cacheRemoveTicket(ticketId) { const db = _dbLoad(); delete db.tickets[ticketId]; _dbSave(); }

function cacheAddLink(ticketId, link) {
  const db = _dbLoad();
  if (!db.tickets[ticketId]) db.tickets[ticketId] = {};
  const links = db.tickets[ticketId].links || [];
  links.push({ ...link, id: Date.now().toString(), addedAt: new Date().toISOString() });
  db.tickets[ticketId].links = links;
  _dbSave();
}

function cacheRemoveLink(ticketId, linkId) {
  const db = _dbLoad();
  if (!db.tickets[ticketId]?.links) return;
  db.tickets[ticketId].links = db.tickets[ticketId].links.filter(l => l.id !== linkId);
  _dbSave();
}

function getActiveTickets() { return Object.keys(_dbLoad().tickets); }
function getDb() { return _dbLoad(); }

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
  if (arts.length) { lines.push('\n## Confluence Articles'); arts.forEach(a => lines.push(`- [${a.title}](${a.url}) — space: ${a.space} (v${a.version}, ${a.lastModified?.slice(0, 10) || '?'})`)); }
  if (tl.length)   { lines.push('\n## Timeline (recent changes)'); tl.slice(0, 10).forEach(e => lines.push(`- **${e.date?.slice(0, 16)}** [${e.type}] ${e.summary}`)); }
  const links = _dbLoad().tickets[ticketId]?.links || [];
  if (links.length) { lines.push('\n## Manual Context Links'); links.forEach(l => lines.push(`- [${l.type || 'link'}] ${l.title ? l.title + ' — ' : ''}${l.url}`)); }
  return lines.filter(l => l !== '').join('\n');
}

module.exports = { cacheRead, cacheWrite, cacheAppendTimeline, cacheRemoveTicket, cacheAddLink, cacheRemoveLink, getActiveTickets, getDb, formatTicketContext };
