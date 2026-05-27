#!/usr/bin/env node
// postinstall.js — runs automatically after `npm install`
// 1. Creates .env from .env.example if it doesn't exist
// 2. Adds .env and mcp.info to .git/info/exclude

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const envFile = path.join(root, '.env');
const envExample = path.join(root, '.env.example');
const gitExclude = path.join(root, '.git', 'info', 'exclude');

// ── 1. Create .env ─────────────────────────────────────────────────────────────
if (!fs.existsSync(envFile)) {
  fs.copyFileSync(envExample, envFile);
  console.log('[postinstall] .env created from .env.example — fill in your credentials.');
} else {
  console.log('[postinstall] .env already exists — skipping.');
}

// ── 2. Git exclude ─────────────────────────────────────────────────────────────
const entries = ['.env', 'mcp.info'];

try {
  const infoDir = path.join(root, '.git', 'info');
  if (!fs.existsSync(infoDir)) fs.mkdirSync(infoDir, { recursive: true });

  let content = fs.existsSync(gitExclude) ? fs.readFileSync(gitExclude, 'utf8') : '';

  let changed = false;
  for (const entry of entries) {
    if (!content.includes(entry)) {
      content = content.trimEnd() + '\n' + entry + '\n';
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(gitExclude, content, 'utf8');
    console.log('[postinstall] Added .env and mcp.info to .git/info/exclude.');
  } else {
    console.log('[postinstall] .git/info/exclude already configured.');
  }
} catch (e) {
  // Not a git repo or no .git folder — skip silently
  console.log('[postinstall] No .git found — skipping git exclude setup.');
}
