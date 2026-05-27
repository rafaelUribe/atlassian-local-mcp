const { fetchBitbucket }       = require('../atlassian');
const { BITBUCKET_WORKSPACE }  = require('../config');

const NO_WORKSPACE = 'Missing BITBUCKET_WORKSPACE in .env';

module.exports = {

  bitbucket_get_repos: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    let apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}?pagelen=50&sort=-updated_on`;
    if (args.filter) apiPath += `&q=name~"${encodeURIComponent(args.filter)}"`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const repos = res.values || [];
      if (!repos.length) return send(id, 'No se encontraron repositorios.');
      const lines = repos.map(r => `${r.slug} — ${r.description || '(no description)'} | ${r.scm.toUpperCase()} | ${r.is_private ? 'Private' : 'Public'}`);
      send(id, `Repositories en ${BITBUCKET_WORKSPACE} (${repos.length}):\n\n${lines.join('\n')}`);
    });
  },

  bitbucket_get_pull_requests: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const state   = args.state || 'OPEN';
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests?state=${state}&pagelen=20`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const prs = res.values || [];
      if (!prs.length) return send(id, `No hay pull requests con estado "${state}".`);
      const lines = prs.map(pr =>
        `[#${pr.id}] ${pr.title}\n  ${pr.source?.branch?.name} → ${pr.destination?.branch?.name} | Autor: ${pr.author?.display_name} | ${pr.state}`
      );
      send(id, `Pull requests en ${args.repo} (${prs.length}):\n\n${lines.join('\n\n')}`);
    });
  },

  bitbucket_get_pull_request: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}`;
    fetchBitbucket(apiPath, 'GET', null, (err, pr) => {
      if (err) return sendErr(id, err);
      const reviewers = (pr.reviewers || []).map(r => r.display_name).join(', ') || 'Ninguno';
      const out = [
        `[#${pr.id}] ${pr.title}`,
        `Estado: ${pr.state} | Autor: ${pr.author?.display_name}`,
        `${pr.source?.branch?.name} → ${pr.destination?.branch?.name}`,
        `Revisores: ${reviewers}`,
        `Creado: ${pr.created_on?.slice(0, 10)} | Actualizado: ${pr.updated_on?.slice(0, 10)}`,
        pr.description ? `\nDescripción:\n${pr.description}` : '',
        `\nURL: ${pr.links?.html?.href || ''}`,
      ].filter(Boolean).join('\n');
      send(id, out);
    });
  },

  bitbucket_create_pull_request: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests`;
    const body = {
      title: args.title, description: args.description || '',
      source: { branch: { name: args.sourceBranch } },
      destination: { branch: { name: args.targetBranch || 'main' } },
      reviewers: (args.reviewers || []).map(username => ({ username })),
      close_source_branch: false,
    };
    fetchBitbucket(apiPath, 'POST', body, (err, pr) => {
      if (err) return sendErr(id, err);
      send(id, `Pull request creado: [#${pr.id}] ${pr.title}\nURL: ${pr.links?.html?.href || ''}`);
    });
  },

  bitbucket_add_pr_comment: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/comments`;
    fetchBitbucket(apiPath, 'POST', { content: { raw: args.comment } }, (err) => {
      if (err) return sendErr(id, err);
      send(id, `Comment added to PR #${args.prId}.`);
    });
  },

  bitbucket_get_branches: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    let apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/refs/branches?pagelen=30&sort=-target.date`;
    if (args.filter) apiPath += `&q=name~"${encodeURIComponent(args.filter)}"`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const branches = res.values || [];
      if (!branches.length) return send(id, 'No se encontraron ramas.');
      const lines = branches.map(b => `${b.name} — latest commit: ${b.target?.hash?.slice(0, 7) || '?'} (${b.target?.date?.slice(0, 10) || '?'})`);
      send(id, `Ramas en ${args.repo} (${branches.length}):\n\n${lines.join('\n')}`);
    });
  },

  bitbucket_get_commits: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const limit = args.limit || 20;
    let apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/commits?pagelen=${limit}`;
    if (args.branch) apiPath += `&include=${encodeURIComponent(args.branch)}`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const commits = res.values || [];
      if (!commits.length) return send(id, 'No se encontraron commits.');
      const lines = commits.map(c => `${c.hash?.slice(0, 7)} — ${c.message?.split('\n')[0]} [${c.author?.raw}] (${c.date?.slice(0, 10)})`);
      send(id, `Commits (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

  bitbucket_get_diff: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/diff`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const text = typeof res === 'string' ? res : JSON.stringify(res);
      send(id, text.slice(0, 8000) + (text.length > 8000 ? '\n...(truncated)' : ''));
    });
  },

  bitbucket_approve_pr: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/approve`;
    fetchBitbucket(apiPath, 'POST', {}, (err) => {
      if (err) return sendErr(id, err);
      send(id, `PR #${args.prId} aprobado.`);
    });
  },

  bitbucket_unapprove_pr: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/approve`;
    fetchBitbucket(apiPath, 'DELETE', null, (err) => {
      if (err) return sendErr(id, err);
      send(id, `PR approval removed #${args.prId}.`);
    });
  },

  bitbucket_merge_pr: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/merge`;
    const body = { type: 'pullrequest', merge_strategy: args.mergeStrategy || 'merge_commit', ...(args.message ? { message: args.message } : {}) };
    fetchBitbucket(apiPath, 'POST', body, (err, pr) => {
      if (err) return sendErr(id, err);
      send(id, `PR #${args.prId} mergeado. Estado: ${pr.state}`);
    });
  },

  bitbucket_decline_pr: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/decline`;
    fetchBitbucket(apiPath, 'POST', {}, (err) => {
      if (err) return sendErr(id, err);
      send(id, `PR #${args.prId} declinado.`);
    });
  },

  bitbucket_get_pr_comments: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/comments?pagelen=50`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const comments = res.values || [];
      if (!comments.length) return send(id, 'Sin comentarios.');
      const lines = comments.map(c => `[${c.id}] ${c.author?.display_name} (${c.created_on?.slice(0, 10)}):\n  ${(c.content?.raw || '').slice(0, 200)}`);
      send(id, `PR comments #${args.prId} (${lines.length}):\n\n${lines.join('\n\n')}`);
    });
  },

  bitbucket_get_file: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const branchQs = args.branch ? `?at=${encodeURIComponent(args.branch)}` : '';
    const apiPath  = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/src/HEAD/${encodeURIComponent(args.path)}${branchQs}`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const text = typeof res === 'string' ? res : JSON.stringify(res);
      send(id, text.slice(0, 10000) + (text.length > 10000 ? '\n...(truncated)' : ''));
    });
  },

  bitbucket_get_pipelines: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const limit   = args.limit || 10;
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pipelines/?sort=-created_on&pagelen=${limit}`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const pipelines = res.values || [];
      if (!pipelines.length) return send(id, 'Sin pipelines.');
      const lines = pipelines.map(p =>
        `[${p.build_number}] ${p.state?.name}${p.state?.result?.name ? ` / ${p.state.result.name}` : ''} — ${p.created_on?.slice(0, 16)} | rama: ${p.target?.ref_name || '-'}`
      );
      send(id, `Pipelines of ${args.repo} (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

  bitbucket_get_pipeline: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pipelines/${encodeURIComponent(args.pipelineId)}`;
    fetchBitbucket(apiPath, 'GET', null, (err, p) => {
      if (err) return sendErr(id, err);
      const out = [
        `Pipeline #${p.build_number} — ${p.state?.name} / ${p.state?.result?.name || '-'}`,
        `Rama: ${p.target?.ref_name || '-'} | Commit: ${p.target?.commit?.hash?.slice(0, 7) || '-'}`,
        `Started: ${p.created_on?.slice(0, 16)} | Duration: ${p.duration_in_seconds || '-'}s`,
      ].join('\n');
      send(id, out);
    });
  },

  bitbucket_list_workspace_members: (id, args, send, sendErr) => {
    if (!BITBUCKET_WORKSPACE) return send(id, NO_WORKSPACE);
    const apiPath = `/2.0/workspaces/${encodeURIComponent(BITBUCKET_WORKSPACE)}/members?pagelen=50`;
    fetchBitbucket(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const members = res.values || [];
      if (!members.length) return send(id, 'No members.');
      const lines = members.map(m => `${m.user?.display_name} (${m.user?.account_id || '-'})`);
      send(id, `Workspace members ${BITBUCKET_WORKSPACE} (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

};
