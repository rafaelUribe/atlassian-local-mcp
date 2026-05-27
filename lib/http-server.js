const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { fetchBitbucket, fetchAtlassian } = require('./atlassian');
const { dispatchTool }    = require('./dispatch');
const TOOLS               = require('./tools');
const { cacheAddLink, cacheRemoveLink, cacheRemoveTicket, cacheWrite, getDb } = require('./cache');
const { BITBUCKET_WORKSPACE, BITBUCKET_PROJECTS, ATLASSIAN_EMAIL, MAX_BODY_SIZE, ROOT } = require('./config');

// ── Static file server ────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(pathname, res) {
  if (pathname === '/ui' || pathname === '/ui/') pathname = '/ui/index.html';
  if (!pathname.startsWith('/ui/')) {
    if (pathname === '/' || pathname === '') { res.writeHead(302, { Location: '/ui/' }); return res.end(); }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not Found');
  }
  const relativePath = pathname.slice(4);
  const safePath     = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const filePath     = path.join(ROOT, 'public', safePath);
  const publicRoot   = path.join(ROOT, 'public');
  if (!filePath.startsWith(publicRoot)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return serveStatic(pathname + '/index.html', res);
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found');
  }
}

// ── JSON-RPC request handler ──────────────────────────────────────────────────
function handleRequest(req, respondFn) {
  if (req.method === 'initialize')
    return respondFn(req.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'atlassian-local-mcp', version: '1.0.0' } });
  if (req.method === 'notifications/initialized') return;
  if (req.method === 'tools/list') return respondFn(req.id, { tools: TOOLS });
  if (req.method === 'tools/call') {
    const { name, arguments: args = {} } = req.params || {};
    if (!name) return respondFn(req.id, { isError: true, content: [{ type: 'text', text: 'Missing tool name in params' }] });
    return dispatchTool(req.id, name, args, respondFn);
  }
  respondFn(req.id, { content: [{ type: 'text', text: `Unknown method: ${req.method}` }] });
}

// ── POST body helper ──────────────────────────────────────────────────────────
function readBody(req, res, cb) {
  let body = '', size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) return;
    body += chunk;
  });
  req.on('end', () => {
    if (size > MAX_BODY_SIZE) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'Request body too large' }));
    }
    try { cb(JSON.parse(body)); }
    catch (err) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Parse error' })); }
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
function startHttpServer(port, bindHost) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, `http://${req.headers.host}`);

    // ── GET routes ────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', server: 'atlassian-local-mcp', tools: TOOLS.length, uptime: Math.floor(process.uptime()) }));
      }
      if (url.pathname === '/api/config') {
        try {
          const config = {};
          for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
            const m = line.match(/^([A-Z_]+)=(.*)$/);
            if (m) config[m[1]] = m[1].includes('TOKEN') ? (m[2] && m[2] !== 'your_atlassian_api_token' ? '••••••••' : '') : m[2];
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(config));
        } catch { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}'); }
      }
      if (url.pathname === '/api/cache/tickets') {
        try {
          const tickets = Object.entries(getDb().tickets).map(([id, data]) => ({
            id, context: data.context || null, repos: data.repos || [], articles: data.articles || [],
            related: data.related || [], timeline: data.timeline || [], pinned: data.pinned || [], links: data.links || [],
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(tickets));
        } catch (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: err.message })); }
      }
      if (url.pathname === '/api/confluence/spaces') {
        return fetchAtlassian('/wiki/api/v2/spaces?limit=250&type=global&status=current', 'GET', null, (err, data) => {
          if (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: err.message })); }
          const spaces = (data.results || []).filter(s => s.key && !s.key.startsWith('~')).map(s => ({ key: s.key, name: s.name }));
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ spaces }));
        });
      }
      if (url.pathname === '/api/bitbucket/projects') {
        if (!BITBUCKET_WORKSPACE) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ projects: [] })); }
        return fetchBitbucket(`/2.0/workspaces/${encodeURIComponent(BITBUCKET_WORKSPACE)}/projects?pagelen=50`, 'GET', null, (err, data) => {
          if (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: err.message })); }
          const projects = (data.values || []).map(p => ({ key: p.key, name: p.name }));
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ projects }));
        });
      }
      if (url.pathname === '/api/jira/my-tickets') {
        const jql = `assignee = "${ATLASSIAN_EMAIL}" AND statusCategory != Done ORDER BY updated DESC`;
        return fetchAtlassian('/rest/api/3/search/jql', 'POST',
          { jql, maxResults: 30, fields: ['summary', 'status', 'priority', 'issuetype'] },
          (err, data) => {
            if (err) { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: err.message })); }
            const issues = (data.issues || []).map(i => ({
              key: i.key, summary: i.fields?.summary,
              status: i.fields?.status?.name, priority: i.fields?.priority?.name,
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ issues }));
          });
      }
      if (url.pathname === '/api/bitbucket/repos') {
        if (!BITBUCKET_WORKSPACE) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]'); }
        let qFilter = '';
        if (BITBUCKET_PROJECTS.length === 1) {
          qFilter = `&q=project.key%3D%22${encodeURIComponent(BITBUCKET_PROJECTS[0])}%22`;
        } else if (BITBUCKET_PROJECTS.length > 1) {
          const keys = BITBUCKET_PROJECTS.map(k => `%22${encodeURIComponent(k)}%22`).join('%2C');
          qFilter = `&q=project.key+IN+(${keys})`;
        }
        return fetchBitbucket(`/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}?pagelen=100${qFilter}`, 'GET', null, (err, data) => {
          const repos = err ? [] : (data.values || []).map(r => ({ slug: r.slug, name: r.name || r.slug, project: r.project?.key }));
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(repos));
        });
      }
      return serveStatic(url.pathname, res);
    }

    // ── POST routes ───────────────────────────────────────────────────────────
    if (req.method !== 'POST') { res.writeHead(405); return res.end('Method Not Allowed'); }

    if (url.pathname === '/api/cache/link') {
      return readBody(req, res, ({ ticketId, link }) => {
        cacheAddLink(String(ticketId).toUpperCase(), link);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
      });
    }
    if (url.pathname === '/api/cache/link/remove') {
      return readBody(req, res, ({ ticketId, linkId }) => {
        cacheRemoveLink(String(ticketId).toUpperCase(), String(linkId));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
      });
    }
    if (url.pathname === '/api/cache/ticket/remove') {
      return readBody(req, res, ({ ticketId }) => {
        cacheRemoveTicket(String(ticketId).toUpperCase());
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
      });
    }
    if (url.pathname === '/api/cache/pin') {
      return readBody(req, res, ({ ticketId, pinnedRepos }) => {
        cacheWrite(String(ticketId).toUpperCase(), 'pinned.json', pinnedRepos);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
      });
    }
    if (url.pathname === '/api/config') {
      return readBody(req, res, (data) => {
        const allowed = ['JIRA_HOST', 'JIRA_EMAIL', 'JIRA_TOKEN', 'BITBUCKET_WORKSPACE', 'BITBUCKET_PROJECTS', 'BASE_BRANCHES', 'BRANCH_PREFIX', 'ACTIVE_TICKETS', 'CONFLUENCE_SPACES', 'JIRA_EPIC', 'HTTP_PORT', 'HTTP_BIND'];
        const envPath = path.join(ROOT, '.env');
        let existingToken = '';
        try { const m = fs.readFileSync(envPath, 'utf8').match(/^JIRA_TOKEN=(.+)$/m); if (m) existingToken = m[1]; } catch {}
        const lines = ['# Atlassian MCP — local credentials', '# NEVER commit this file.', ''];
        for (const key of allowed) {
          let val = (data[key] || '').trim();
          if (key === 'JIRA_TOKEN' && (val === '••••••••' || val === '')) val = existingToken;
          if (!val && key === 'BASE_BRANCHES') val = 'develop,test';
          if (!val && key === 'BRANCH_PREFIX')  val = 'task/';
          if (val) lines.push(`${key}=${val}`);
        }
        fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true }));
        setTimeout(() => {
          const { spawn } = require('child_process');
          const child = spawn(process.argv[0], process.argv.slice(1).concat('--no-open'), {
            cwd: ROOT, detached: true, stdio: 'ignore',
            env: { ...process.env, ...Object.fromEntries(lines.filter(l => l.includes('=')).map(l => { const [k, ...v] = l.split('='); return [k, v.join('=')]; })) },
          });
          child.unref();
          process.exit(0);
        }, 300);
      });
    }

    // JSON-RPC endpoint
    let body = '', size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request body too large' } }));
        req.destroy(); return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (size > MAX_BODY_SIZE) return;
      let parsed;
      try { parsed = JSON.parse(body); }
      catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })); }
      handleRequest(parsed, (id, result) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
      });
    });
  });

  const infoPath = path.join(ROOT, 'mcp.info');
  const shutdown = (signal) => {
    process.stderr.write(`\n${signal} received — shutting down...\n`);
    try { fs.unlinkSync(infoPath); } catch {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.listen(port, bindHost, () => {
    const displayedHost = bindHost === '0.0.0.0' ? 'localhost' : bindHost;
    const urlBase = `http://${displayedHost}:${port}/`;
    process.stderr.write(`Atlassian MCP HTTP server listening on ${urlBase}\n`);
    process.stderr.write(`Tools: ${TOOLS.length} | UI: ${urlBase}ui/\n`);
    try {
      fs.writeFileSync(infoPath, JSON.stringify({ url: urlBase, host: bindHost, port: Number(port), pid: process.pid, startedAt: new Date().toISOString() }, null, 2), 'utf8');
      process.stderr.write(`MCP info written to ${infoPath}\n`);
    } catch (e) { process.stderr.write(`Failed writing MCP info: ${e.message}\n`); }
    if (!process.argv.includes('--no-open')) {
      const uiUrl = `${urlBase}ui/`;
      const cmd   = process.platform === 'win32' ? `start "" "${uiUrl}"` : process.platform === 'darwin' ? `open "${uiUrl}"` : `xdg-open "${uiUrl}"`;
      require('child_process').exec(cmd, () => {});
    }
  });
}

module.exports = { startHttpServer, handleRequest };
