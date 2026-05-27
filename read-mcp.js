#!/usr/bin/env node
// Small helper to read atlassian/mcp.info and print the MCP URL (or JSON with --json)
const fs = require('fs');
const path = require('path');

const infoPath = path.join(__dirname, 'mcp.info');
const args = process.argv.slice(2);
const asJson = args.includes('--json');

try {
  const raw = fs.readFileSync(infoPath, 'utf8');
  const info = JSON.parse(raw);
  if (asJson) {
    console.log(JSON.stringify(info, null, 2));
  } else if (info.url) {
    console.log(info.url);
  } else {
    console.log(JSON.stringify(info));
  }
  process.exit(0);
} catch (e) {
  console.error(`Error reading ${infoPath}: ${e.message}`);
  process.exit(2);
}
