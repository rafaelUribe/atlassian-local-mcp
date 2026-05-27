const fs   = require('fs');
const path = require('path');
const { atlassianP } = require('./atlassian');
const cfg = require('./config');

const SPACES_DIR = path.join(cfg.ROOT, 'cache', 'spaces');

function _spacePath(spaceKey) {
  return path.join(SPACES_DIR, `${spaceKey}.json`);
}

function getSpaceIndex(spaceKey) {
  try { return JSON.parse(fs.readFileSync(_spacePath(spaceKey), 'utf8')); }
  catch { return { articles: [], indexedAt: null }; }
}

function saveSpaceIndex(spaceKey, data) {
  fs.mkdirSync(SPACES_DIR, { recursive: true });
  const tmp = _spacePath(spaceKey) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, _spacePath(spaceKey));
}

async function indexSpace(spaceKey) {
  const articles = [];
  let cursor = null;
  do {
    const qs = cursor ? `?limit=250&cursor=${encodeURIComponent(cursor)}` : '?limit=250';
    const res = await atlassianP(`/wiki/api/v2/spaces/${encodeURIComponent(spaceKey)}/pages${qs}`, 'GET', null);
    for (const p of (res.results || [])) {
      articles.push({
        id:           String(p.id),
        title:        p.title,
        spaceKey,
        url:          `https://${cfg.ATLASSIAN_HOST}/wiki${p._links?.webui || `/spaces/${spaceKey}/pages/${p.id}`}`,
        version:      p.version?.number,
        lastModified: p.version?.createdAt,
      });
    }
    // Confluence v2 pagination via _links.next query param
    const nextLink = res._links?.next;
    if (nextLink) {
      try { cursor = new URL('https://x' + nextLink).searchParams.get('cursor'); }
      catch { cursor = null; }
    } else {
      cursor = null;
    }
  } while (cursor);

  saveSpaceIndex(spaceKey, { articles, indexedAt: new Date().toISOString() });
  return articles.length;
}

async function indexAllSpaces() {
  const spaces = cfg.CONFLUENCE_SPACES;
  if (!spaces.length) {
    process.stderr.write('[confluence] No spaces configured, skipping index.\n');
    return;
  }
  process.stderr.write(`[confluence] Indexing ${spaces.length} space(s): ${spaces.join(', ')}\n`);
  for (const spaceKey of spaces) {
    try {
      const n = await indexSpace(spaceKey);
      process.stderr.write(`[confluence] ✓ ${spaceKey}: ${n} articles indexed\n`);
    } catch (e) {
      process.stderr.write(`[confluence] ✗ ${spaceKey}: ${e.message}\n`);
    }
  }
}

/**
 * Find articles relevant to a ticket using local index (no API call).
 * Scores by: ticketId in title (10pts), keyword from summary in title (1pt each).
 * Returns top N articles sorted by score desc.
 */
function findRelevantArticles(ticketId, jiraSummary, topN = 8) {
  const keywords = [
    ticketId.toLowerCase(),
    ...(jiraSummary || '').toLowerCase().split(/\W+/).filter(w => w.length > 4),
  ];

  const results = [];
  for (const spaceKey of cfg.CONFLUENCE_SPACES) {
    const { articles } = getSpaceIndex(spaceKey);
    for (const a of articles) {
      const t = a.title.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (t.includes(kw)) score += (kw === ticketId.toLowerCase() ? 10 : 1);
      }
      if (score > 0) results.push({ ...a, _score: score });
    }
  }

  return results
    .sort((a, b) => b._score - a._score)
    .slice(0, topN)
    .map(({ _score, ...a }) => a);
}

module.exports = { indexAllSpaces, indexSpace, getSpaceIndex, findRelevantArticles };
