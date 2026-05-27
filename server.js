require('dotenv').config();
require('./lib/config'); // validates required env vars, exits if missing

const { startHttpServer, handleRequest } = require('./lib/http-server');
const { dispatchTool }                   = require('./lib/dispatch');
const TOOLS                              = require('./lib/tools');
const { scheduleSync }                   = require('./lib/sync');

// -- Transport selection -------------------------------------------------------
const httpPort = process.env.HTTP_PORT
  || (process.argv.includes('--http') && (process.argv[process.argv.indexOf('--http') + 1] || '3847'));
const httpBind = process.env.HTTP_BIND
  || (process.argv.includes('--host') && (process.argv[process.argv.indexOf('--host') + 1]))
  || '0.0.0.0';

if (httpPort && !isNaN(Number(httpPort))) {
  startHttpServer(Number(httpPort), httpBind);
} else if (process.argv.includes('--http')) {
  startHttpServer(3847, httpBind);
} else {
  let buffer = '';
  const respond = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  process.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { handleRequest(JSON.parse(line), respond); } catch { /* ignore parse errors */ }
    }
  });
}

scheduleSync();
