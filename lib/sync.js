const { indexTicket }      = require('./indexer');
const { getActiveTickets, cacheRead } = require('./cache');
const { indexAllSpaces }   = require('./confluence-indexer');

async function runBackgroundSync() {
  const active = getActiveTickets();
  if (!active.length) return;
  process.stderr.write(`[sync] Starting background sync for ${active.length} active ticket(s)...\n`);
  for (const ticketId of active) {
    try {
      await indexTicket(ticketId);
      const tl = cacheRead(ticketId, 'timeline.json') || [];
      process.stderr.write(`[sync] ✓ ${ticketId}: ${tl[0]?.summary || 'ok'}\n`);
    } catch (err) {
      process.stderr.write(`[sync] ✗ ${ticketId}: ${err.message}\n`);
    }
  }
  process.stderr.write('[sync] Done.\n');
}

// Delay first sync 10 s after startup to let the server stabilise, then every 24 h
function scheduleSync() {
  // Confluence space index: 30s after startup, then every 6h
  setTimeout(() => {
    indexAllSpaces();
    setInterval(indexAllSpaces, 6 * 60 * 60 * 1000);
  }, 30000);

  // Ticket sync: 60s after startup, then every hour
  setTimeout(() => {
    runBackgroundSync();
    setInterval(runBackgroundSync, 60 * 60 * 1000);
  }, 60000);
}

module.exports = { runBackgroundSync, scheduleSync };
