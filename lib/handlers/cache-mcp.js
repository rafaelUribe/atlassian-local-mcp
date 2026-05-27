const fs   = require('fs');
const path = require('path');
const { indexTicket }                                           = require('../indexer');
const { formatTicketContext, cacheRead, getActiveTickets, cacheRemoveTicket, cacheAddLink, getDb } = require('../cache');
const { ROOT } = require('../config');

module.exports = {

  mcp_index_ticket: (id, args, send, sendErr) => {
    const ticketId = (args.ticketId || '').toUpperCase().trim();
    if (!ticketId) return sendErr(id, new Error('ticketId is required'));
    (async () => {
      try {
        await indexTicket(ticketId);
        send(id, formatTicketContext(ticketId));
      } catch (err) { sendErr(id, err); }
    })();
  },

  mcp_get_ticket_context: (id, args, send, sendErr) => {
    const ticketId = (args.ticketId || '').toUpperCase().trim();
    if (!ticketId) return sendErr(id, new Error('ticketId is required'));
    send(id, formatTicketContext(ticketId));
  },

  mcp_remove_ticket: (id, args, send, sendErr) => {
    const ticketId = (args.ticketId || '').trim().toUpperCase();
    if (!ticketId) return sendErr(id, new Error('ticketId is required'));
    if (!getDb().tickets[ticketId]) return send(id, `${ticketId} is not in the cache.`);
    cacheRemoveTicket(ticketId);
    send(id, `✓ ${ticketId} removed from the knowledge cache.`);
  },

  mcp_add_context_link: (id, args, send, sendErr) => {
    const ticketId = (args.ticketId || '').trim().toUpperCase();
    const url      = (args.url || '').trim();
    if (!ticketId || !url) return sendErr(id, new Error('ticketId and url are required'));
    cacheAddLink(ticketId, { url, title: args.title || '', type: args.type || 'other' });
    send(id, `✓ Link added to ${ticketId}: ${args.title || url}`);
  },

  mcp_sync_active_tickets: (id, args, send, sendErr) => {
    (async () => {
      const active = getActiveTickets();
      if (!active.length) return send(id, 'No tickets in the cache yet. Use mcp_index_ticket to start tracking tickets.');
      const results = [];
      for (const ticketId of active) {
        try {
          await indexTicket(ticketId);
          const tl = cacheRead(ticketId, 'timeline.json') || [];
          results.push(`✓ ${ticketId}: ${tl[0]?.summary || 'synced'}`);
        } catch (err) { results.push(`✗ ${ticketId}: ${err.message}`); }
      }
      send(id, `Sync complete (${active.length} tickets):\n\n${results.join('\n')}`);
    })();
  },

  mcp_list_cached_tickets: (id, args, send, sendErr) => {
    try {
      const db  = getDb();
      const ids = Object.keys(db.tickets);
      if (!ids.length) return send(id, 'Cache is empty. Run mcp_index_ticket to start indexing.');
      const rows = ids.map(ticketId => {
        const data  = db.tickets[ticketId];
        const ctx   = data.context;
        const tl    = data.timeline || [];
        const repos = data.repos    || [];
        const arts  = data.articles || [];
        const rel   = data.related  || [];
        return `**${ticketId}** [${ctx?.jira?.status || '?'}] ${ctx?.jira?.summary || '(no context)'}
  • Indexed: ${ctx?.indexedAt?.slice(0, 16) || '?'} | Repos: ${repos.length} | Articles: ${arts.length} | Related: ${rel.length} | Timeline entries: ${tl.length}
  • Last change: ${tl[0]?.date?.slice(0, 16) || '?'} — ${tl[0]?.summary || ''}`;
      });
      send(id, `Cached tickets (${ids.length}):\n\n${rows.join('\n\n')}`);
    } catch (err) { sendErr(id, err); }
  },

  mcp_get_agent_context: (id, args, send, sendErr) => {
    const templatePath = path.join(ROOT, 'agents', 'agents-template.md');
    try {
      let content = fs.readFileSync(templatePath, 'utf8');
      const baseBranches = (process.env.BASE_BRANCHES || 'develop,test').split(',').map(b => b.trim());
      const branchPrefix = process.env.BRANCH_PREFIX || 'task/';
      content = content.replace(/\{\{BASE_BRANCHES\}\}/g, JSON.stringify(baseBranches));
      content = content.replace(/\{\{BRANCH_PREFIX\}\}/g, branchPrefix);
      send(id, content);
    } catch (e) {
      sendErr(id, new Error(`Cannot read agents-template.md: ${e.message}`));
    }
  },

};
