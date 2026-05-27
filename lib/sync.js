const { indexTicket }      = require('./indexer');
const { getActiveTickets, cacheRead } = require('./cache');

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
  setTimeout(() => {
    runBackgroundSync();
    setInterval(runBackgroundSync, 24 * 60 * 60 * 1000);
  }, 10000);
}

module.exports = { runBackgroundSync, scheduleSync };
