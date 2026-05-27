const path = require('path');

const ATLASSIAN_HOST      = (process.env.JIRA_HOST || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const ATLASSIAN_EMAIL     = process.env.JIRA_EMAIL;
const ATLASSIAN_TOKEN     = process.env.JIRA_TOKEN;
const BITBUCKET_WORKSPACE = process.env.BITBUCKET_WORKSPACE;
const BITBUCKET_PROJECTS  = (process.env.BITBUCKET_PROJECTS || '').split(',').map(s => s.trim()).filter(Boolean);

const missing = [];
if (!ATLASSIAN_HOST)  missing.push('JIRA_HOST');
if (!ATLASSIAN_EMAIL) missing.push('JIRA_EMAIL');
if (!ATLASSIAN_TOKEN) missing.push('JIRA_TOKEN');
if (missing.length) {
  process.stderr.write('\n╔══════════════════════════════════════════════════════════╗\n');
  process.stderr.write('║  Missing required credentials in .env                    ║\n');
  process.stderr.write('╚══════════════════════════════════════════════════════════╝\n\n');
  for (const v of missing) process.stderr.write(`  ✗ ${v} — not set\n`);
  process.stderr.write('\n  Fix: open .env and fill in the missing values.\n');
  process.stderr.write('  See README.md → "Credentials setup" for details.\n\n');
  process.exit(1);
}

const auth         = Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_TOKEN}`).toString('base64');
const MAX_BODY_SIZE = 1024 * 1024;
const ROOT          = path.join(__dirname, '..');

module.exports = { ATLASSIAN_HOST, ATLASSIAN_EMAIL, ATLASSIAN_TOKEN, BITBUCKET_WORKSPACE, BITBUCKET_PROJECTS, auth, MAX_BODY_SIZE, ROOT };
