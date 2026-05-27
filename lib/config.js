const path = require('path');

const ROOT = path.join(__dirname, '..');

// Single mutable config object — all modules hold a reference to THIS object.
// Mutating properties here is immediately visible to all consumers that
// access cfg.X at call-time (not via destructuring at load-time).
const cfg = {
  ATLASSIAN_HOST: '', ATLASSIAN_EMAIL: '', ATLASSIAN_TOKEN: '',
  BITBUCKET_WORKSPACE: '', BITBUCKET_PROJECTS: [],
  CONFLUENCE_SPACES: [], BASE_BRANCHES: ['develop'],
  BRANCH_PREFIX: 'task/', JIRA_EPIC: '',
  HTTP_PORT: 3847, HTTP_BIND: '0.0.0.0',
  auth: '', MAX_BODY_SIZE: 1024 * 1024, ROOT,
};

function _recompute() {
  cfg.auth = (cfg.ATLASSIAN_EMAIL && cfg.ATLASSIAN_TOKEN)
    ? Buffer.from(`${cfg.ATLASSIAN_EMAIL}:${cfg.ATLASSIAN_TOKEN}`).toString('base64')
    : '';
}

function _splitList(v) {
  return typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : (v || []);
}

function loadFromEnv() {
  cfg.ATLASSIAN_HOST      = (process.env.JIRA_HOST || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  cfg.ATLASSIAN_EMAIL     = process.env.JIRA_EMAIL || '';
  cfg.ATLASSIAN_TOKEN     = process.env.JIRA_TOKEN || '';
  cfg.BITBUCKET_WORKSPACE = process.env.BITBUCKET_WORKSPACE || '';
  cfg.BITBUCKET_PROJECTS  = _splitList(process.env.BITBUCKET_PROJECTS || '');
  cfg.CONFLUENCE_SPACES   = _splitList(process.env.CONFLUENCE_SPACES || '');
  cfg.BASE_BRANCHES       = _splitList(process.env.BASE_BRANCHES || 'develop');
  cfg.BRANCH_PREFIX       = process.env.BRANCH_PREFIX || 'task/';
  cfg.JIRA_EPIC           = process.env.JIRA_EPIC || '';
  cfg.HTTP_PORT           = parseInt(process.env.HTTP_PORT || '3847', 10);
  cfg.HTTP_BIND           = process.env.HTTP_BIND || '0.0.0.0';
  _recompute();
}

// Overlay DB config on top of env values (called from server.js after cache loads).
function applyDbConfig(dbCfg) {
  if (!dbCfg || typeof dbCfg !== 'object') return;
  const { JIRA_HOST, JIRA_EMAIL, JIRA_TOKEN, BITBUCKET_WORKSPACE,
          BITBUCKET_PROJECTS, CONFLUENCE_SPACES, BASE_BRANCHES,
          BRANCH_PREFIX, JIRA_EPIC, HTTP_PORT, HTTP_BIND } = dbCfg;
  if (JIRA_HOST)                                    cfg.ATLASSIAN_HOST      = JIRA_HOST.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (JIRA_EMAIL)                                   cfg.ATLASSIAN_EMAIL     = JIRA_EMAIL;
  if (JIRA_TOKEN && JIRA_TOKEN !== '••••••••')      cfg.ATLASSIAN_TOKEN     = JIRA_TOKEN;
  if (BITBUCKET_WORKSPACE !== undefined)            cfg.BITBUCKET_WORKSPACE = BITBUCKET_WORKSPACE;
  if (BITBUCKET_PROJECTS  !== undefined)            cfg.BITBUCKET_PROJECTS  = _splitList(BITBUCKET_PROJECTS);
  if (CONFLUENCE_SPACES   !== undefined)            cfg.CONFLUENCE_SPACES   = _splitList(CONFLUENCE_SPACES);
  if (BASE_BRANCHES       !== undefined)            cfg.BASE_BRANCHES       = _splitList(BASE_BRANCHES);
  if (BRANCH_PREFIX)                                cfg.BRANCH_PREFIX       = BRANCH_PREFIX;
  if (JIRA_EPIC           !== undefined)            cfg.JIRA_EPIC           = JIRA_EPIC;
  if (HTTP_PORT)                                    cfg.HTTP_PORT           = parseInt(HTTP_PORT, 10);
  if (HTTP_BIND)                                    cfg.HTTP_BIND           = HTTP_BIND;
  _recompute();
}

// Initial load
loadFromEnv();

// Warn (don't exit) if credentials are missing — user can configure via UI.
const missing = [];
if (!cfg.ATLASSIAN_HOST)  missing.push('JIRA_HOST');
if (!cfg.ATLASSIAN_EMAIL) missing.push('JIRA_EMAIL');
if (!cfg.ATLASSIAN_TOKEN) missing.push('JIRA_TOKEN');
if (missing.length) {
  process.stderr.write(`\n⚠  Missing credentials: ${missing.join(', ')} — configure at http://localhost:${cfg.HTTP_PORT}/ui/ → Config\n\n`);
}

cfg.loadFromEnv   = loadFromEnv;
cfg.applyDbConfig = applyDbConfig;

module.exports = cfg;
