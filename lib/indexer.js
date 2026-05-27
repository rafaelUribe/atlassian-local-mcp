const { atlassianP, bitbucketP } = require('./atlassian');
const { cacheRead, cacheWrite, cacheAppendTimeline } = require('./cache');
const { findRelevantArticles } = require('./confluence-indexer');
const cfg = require('./config');

const JIRA_FIELDS = 'summary,description,status,priority,assignee,reporter,labels,components,issuetype,comment,subtasks,issuelinks,parent,created,updated,customfield_10014';

async function indexTicket(ticketId) {
  const ticket = await atlassianP(`/rest/api/3/issue/${encodeURIComponent(ticketId)}?fields=${JIRA_FIELDS}`, 'GET', null);
  const fields = ticket.fields || {};

  // Related tickets from links + subtasks
  const relatedKeys = [
    ...(fields.issuelinks || []).map(l => l.inwardIssue?.key || l.outwardIssue?.key).filter(Boolean),
    ...(fields.subtasks   || []).map(s => s.key),
  ].filter(Boolean);
  const relatedTickets = await Promise.all(
    relatedKeys.slice(0, 20).map(k =>
      atlassianP(`/rest/api/3/issue/${encodeURIComponent(k)}?fields=summary,status,priority,assignee`, 'GET', null).catch(() => null)
    )
  );

  // Bitbucket: branches + open PRs that mention this ticket
  let repoBranches = [];
  if (cfg.BITBUCKET_WORKSPACE) {
    try {
      const reposRes = await bitbucketP(`/2.0/repositories/${encodeURIComponent(cfg.BITBUCKET_WORKSPACE)}?pagelen=50`, 'GET', null);
      const branchResults = await Promise.all(
        (reposRes.values || []).map(repo =>
          bitbucketP(`/2.0/repositories/${encodeURIComponent(cfg.BITBUCKET_WORKSPACE)}/${repo.slug}/refs/branches?q=name~"${ticketId}"&pagelen=10`, 'GET', null)
            .then(r => ({ repo: repo.slug, branches: r.values || [] }))
            .catch(() => null)
        )
      );
      repoBranches = branchResults.filter(r => r && r.branches.length > 0);
      await Promise.all(repoBranches.map(async r => {
        try {
          const prs = await bitbucketP(`/2.0/repositories/${encodeURIComponent(cfg.BITBUCKET_WORKSPACE)}/${r.repo}/pullrequests?state=OPEN&pagelen=10`, 'GET', null);
          r.prs = (prs.values || []).filter(p => p.source?.branch?.name?.includes(ticketId));
        } catch { r.prs = []; }
      }));
    } catch {}
  }

  // Confluence: match against local space index (no API call per ticket)
  const articles = findRelevantArticles(ticketId, fields.summary);

  // Build + persist context
  const prev = cacheRead(ticketId, 'context.json');
  const context = {
    ticketId, indexedAt: new Date().toISOString(),
    jira: {
      summary:       fields.summary,
      description:   (fields.description?.content || []).flatMap(b => b.content || []).map(c => c.text || '').join(' ').slice(0, 2000),
      status:        fields.status?.name,   priority:  fields.priority?.name,
      assignee:      fields.assignee?.displayName, reporter: fields.reporter?.displayName,
      labels:        fields.labels || [],   components: (fields.components || []).map(c => c.name),
      issueType:     fields.issuetype?.name, epic: fields.customfield_10014,
      created:       fields.created,        updated:   fields.updated,
      commentsCount: fields.comment?.total || 0,
    },
  };
  cacheWrite(ticketId, 'context.json', context);
  cacheWrite(ticketId, 'related.json', relatedTickets.filter(Boolean).map(t => ({
    key: t.key, summary: t.fields?.summary, status: t.fields?.status?.name,
    priority: t.fields?.priority?.name, assignee: t.fields?.assignee?.displayName,
  })));
  cacheWrite(ticketId, 'repos.json',    repoBranches);
  cacheWrite(ticketId, 'articles.json', articles);

  // Record timeline changes vs previous snapshot
  const changes = [];
  if (!prev) {
    changes.push({ type: 'indexed', summary: `Initial index. Status: ${context.jira.status}. ${relatedKeys.length} related, ${repoBranches.length} repos, ${articles.length} articles.` });
  } else {
    if (prev.jira.status        !== context.jira.status)        changes.push({ type: 'status-change', summary: `Status changed: ${prev.jira.status} → ${context.jira.status}` });
    if (prev.jira.commentsCount !== context.jira.commentsCount) changes.push({ type: 'new-comment',   summary: `Comments: ${prev.jira.commentsCount} → ${context.jira.commentsCount}` });
    const prevArts  = cacheRead(ticketId, 'articles.json') || [];
    const prevRepos = cacheRead(ticketId, 'repos.json')    || [];
    articles.forEach(a => { const o = prevArts.find(p => p.id === a.id); if (o && o.version !== a.version) changes.push({ type: 'article-updated', summary: `Confluence "${a.title}" updated (v${o.version} → v${a.version})` }); });
    repoBranches.forEach(r => {
      const o = prevRepos.find(p => p.repo === r.repo);
      if (!o) { changes.push({ type: 'new-repo', summary: `Bitbucket: new repo found: ${r.repo}` }); }
      else { (r.prs || []).filter(p => !(o.prs || []).find(op => op.id === p.id)).forEach(p => changes.push({ type: 'new-pr', summary: `Bitbucket: new PR in ${r.repo}: "${p.title}"` })); }
    });
    if (!changes.length) changes.push({ type: 'sync', summary: 'No changes detected.' });
  }
  changes.forEach(c => cacheAppendTimeline(ticketId, c));
  return context;
}

module.exports = { indexTicket };
