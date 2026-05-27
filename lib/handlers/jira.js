const { fetchAtlassian } = require('../atlassian');
const { extractText }    = require('../atlassian');
const cfg                = require('../config');

module.exports = {

  jira_search_tickets: (id, args, send, sendErr) => {
    const max = Math.min(args.maxResults || 10, 50);
    fetchAtlassian('/rest/api/3/search/jql', 'POST',
      { jql: args.jql, maxResults: max, fields: ['summary', 'status', 'priority', 'assignee', 'issuetype'] },
      (err, res) => {
        if (err) return sendErr(id, err);
        if (!res.issues?.length) return send(id, 'No tickets found.');
        const lines = res.issues.map(i => {
          const assignee = i.fields.assignee?.displayName || 'Unassigned';
          return `[${i.key}] ${i.fields.summary}\n  Estado: ${i.fields.status.name} | Prioridad: ${i.fields.priority?.name || '-'} | Asignado: ${assignee}`;
        });
        send(id, `${res.total} result(s) (showing ${res.issues.length}):\n\n${lines.join('\n\n')}`);
      });
  },

  jira_get_ticket: (id, args, send, sendErr) => {
    const apiPath = `/rest/api/3/issue/${encodeURIComponent(args.key)}?fields=summary,status,priority,assignee,description,comment,subtasks,labels,issuetype,sprint,customfield_10020`;
    fetchAtlassian(apiPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const f = res.fields;
      const desc     = extractText(f.description);
      const comments = (f.comment?.comments || []).slice(-3).map(c => `  [${c.author.displayName}]: ${extractText(c.body)}`).join('\n');
      const subtasks = (f.subtasks || []).map(s => `  • [${s.key}] ${s.fields.summary} (${s.fields.status.name})`).join('\n');
      const sprint   = f.customfield_10020?.find(s => s.state === 'active')?.name || 'No active sprint';
      const labels   = (f.labels || []).join(', ') || 'None';
      const out = [
        `[${res.key}] ${f.summary}`,
        `Tipo: ${f.issuetype?.name} | Estado: ${f.status.name} | Prioridad: ${f.priority?.name || '-'}`,
        `Asignado: ${f.assignee?.displayName || 'Unassigned'} | Sprint: ${sprint}`,
        `Labels: ${labels}`,
        `\nDescription:\n${desc || '(empty)'}`,
        subtasks ? `\nSubtareas:\n${subtasks}` : '',
        comments ? `\nLatest comments:\n${comments}` : '',
      ].filter(Boolean).join('\n');
      send(id, out);
    });
  },

  jira_get_my_tickets: (id, args, send, sendErr) => {
    let jql = `assignee = "${cfg.ATLASSIAN_EMAIL}" AND statusCategory != Done ORDER BY updated DESC`;
    if (args.status) jql = `assignee = "${cfg.ATLASSIAN_EMAIL}" AND status = "${args.status}" ORDER BY updated DESC`;
    fetchAtlassian('/rest/api/3/search/jql', 'POST',
      { jql, maxResults: 20, fields: ['summary', 'status', 'priority', 'issuetype'] },
      (err, res) => {
        if (err) return sendErr(id, err);
        if (!res.issues?.length) return send(id, 'No assigned tickets currently.');
        const lines = res.issues.map(i => `[${i.key}] ${i.fields.summary} — ${i.fields.status.name} (${i.fields.issuetype?.name})`);
        send(id, `Your tickets (${res.issues.length}):\n\n${lines.join('\n')}`);
      });
  },

  jira_get_projects: (id, args, send, sendErr) => {
    fetchAtlassian('/rest/api/3/project?expand=description', 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const lines = res.map(p => `[${p.key}] ${p.name}${p.description ? ` — ${p.description}` : ''}`);
      send(id, `Projects (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

  jira_get_sprints: (id, args, send, sendErr) => {
    const state = args.state || 'active';
    fetchAtlassian(`/rest/agile/1.0/board/${args.boardId}/sprint?state=${state}`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const sprints = res.values || [];
      if (!sprints.length) return send(id, `No sprints with state "${state}".`);
      const lines = sprints.map(s => `[${s.id}] ${s.name} | ${s.state} | ${s.startDate || '?'} → ${s.endDate || '?'}`);
      send(id, lines.join('\n'));
    });
  },

  jira_add_comment: (id, args, send, sendErr) => {
    const apiPath = `/rest/api/3/issue/${encodeURIComponent(args.key)}/comment`;
    const body = { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: args.comment }] }] } };
    fetchAtlassian(apiPath, 'POST', body, (err) => {
      if (err) return sendErr(id, err);
      send(id, `Comentario agregado a ${args.key}.`);
    });
  },

  jira_transition_ticket: (id, args, send, sendErr) => {
    const transPath = `/rest/api/3/issue/${encodeURIComponent(args.key)}/transitions`;
    fetchAtlassian(transPath, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const transition = (res.transitions || []).find(t => t.name.toLowerCase() === args.transitionName.toLowerCase());
      if (!transition) {
        const available = (res.transitions || []).map(t => t.name).join(', ');
        return send(id, `Transition "${args.transitionName}" not found. Available: ${available}`);
      }
      fetchAtlassian(transPath, 'POST', { transition: { id: transition.id } }, (err2) => {
        if (err2) return sendErr(id, err2);
        send(id, `${args.key} movido a "${transition.name}".`);
      });
    });
  },

  jira_get_boards: (id, args, send, sendErr) => {
    let qs = `maxResults=${args.maxResults || 20}`;
    if (args.projectKey) qs += `&projectKeyOrId=${encodeURIComponent(args.projectKey)}`;
    fetchAtlassian(`/rest/agile/1.0/board?${qs}`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const boards = res.values || [];
      if (!boards.length) return send(id, 'No se encontraron boards.');
      const lines = boards.map(b => `[${b.id}] ${b.name} (${b.type}) — Proyecto: ${b.location?.projectKey || '-'}`);
      send(id, `Boards (${boards.length}):\n\n${lines.join('\n')}`);
    });
  },

  jira_get_sprint_tickets: (id, args, send, sendErr) => {
    const getSprint = (cb) => {
      if (args.sprintId) return cb(null, args.sprintId);
      fetchAtlassian(`/rest/agile/1.0/board/${args.boardId}/sprint?state=active`, 'GET', null, (err, res) => {
        if (err) return cb(err);
        const sprint = (res.values || [])[0];
        if (!sprint) return cb(new Error('No hay sprint activo en este board.'));
        cb(null, sprint.id);
      });
    };
    getSprint((err, sprintId) => {
      if (err) return sendErr(id, err);
      fetchAtlassian(`/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,priority,assignee,issuetype`, 'GET', null, (err2, res) => {
        if (err2) return sendErr(id, err2);
        const issues = res.issues || [];
        if (!issues.length) return send(id, 'Sprint sin tickets.');
        const lines = issues.map(i => `[${i.key}] ${i.fields.summary}\n  ${i.fields.status.name} | ${i.fields.assignee?.displayName || 'Unassigned'}`);
        send(id, `Tickets del sprint (${issues.length}):\n\n${lines.join('\n\n')}`);
      });
    });
  },

  jira_create_ticket: (id, args, send, sendErr) => {
    const fields = { project: { key: args.projectKey }, summary: args.summary, issuetype: { name: args.issueType || 'Task' } };
    if (args.description) fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }] };
    if (args.priority)    fields.priority    = { name: args.priority };
    if (args.labels?.length) fields.labels   = args.labels;
    if (args.assignee)    fields.assignee    = { id: args.assignee };
    if (args.parentKey)   fields.parent      = { key: args.parentKey };
    fetchAtlassian('/rest/api/3/issue', 'POST', { fields }, (err, res) => {
      if (err) return sendErr(id, err);
      send(id, `Ticket creado: [${res.key}]\nURL: https://${cfg.ATLASSIAN_HOST}/browse/${res.key}`);
    });
  },

  jira_update_ticket: (id, args, send, sendErr) => {
    const fields = {};
    if (args.summary)     fields.summary     = args.summary;
    if (args.priority)    fields.priority    = { name: args.priority };
    if (args.labels)      fields.labels      = args.labels;
    if (args.assignee)    fields.assignee    = { id: args.assignee };
    if (args.description) fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }] };
    fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}`, 'PUT', { fields }, (err) => {
      if (err) return sendErr(id, err);
      send(id, `Ticket ${args.key} actualizado.`);
    });
  },

  jira_get_transitions: (id, args, send, sendErr) => {
    fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}/transitions`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const lines = (res.transitions || []).map(t => `[${t.id}] ${t.name} → ${t.to?.name}`);
      send(id, `Available transitions for ${args.key}:\n\n${lines.join('\n')}`);
    });
  },

  jira_delete_comment: (id, args, send, sendErr) => {
    fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}/comment/${encodeURIComponent(args.commentId)}`, 'DELETE', null, (err) => {
      if (err) return sendErr(id, err);
      send(id, `Comentario ${args.commentId} eliminado de ${args.key}.`);
    });
  },

  jira_get_issue_types: (id, args, send, sendErr) => {
    if (args.projectKey) {
      return fetchAtlassian(`/rest/api/3/issuetype/project?projectId=${encodeURIComponent(args.projectKey)}`, 'GET', null, (err, res) => {
        if (err) {
          return fetchAtlassian(`/rest/api/3/project/${encodeURIComponent(args.projectKey)}?expand=issueTypes`, 'GET', null, (err2, res2) => {
            if (err2) return sendErr(id, err2);
            const types = (res2.issueTypes || []).map(t => `[${t.id}] ${t.name} — ${t.description || ''}`);
            send(id, `Tipos en ${args.projectKey}:\n\n${types.join('\n')}`);
          });
        }
        const types = (Array.isArray(res) ? res : []).map(t => `[${t.id}] ${t.name}`);
        send(id, `Tipos en ${args.projectKey}:\n\n${types.join('\n')}`);
      });
    }
    fetchAtlassian('/rest/api/3/issuetype', 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const types = (Array.isArray(res) ? res : []).map(t => `[${t.id}] ${t.name} — ${t.description || ''}`);
      send(id, `Issue types globales (${types.length}):\n\n${types.join('\n')}`);
    });
  },

  jira_link_issues: (id, args, send, sendErr) => {
    const body = { type: { name: args.linkType || 'Relates' }, inwardIssue: { key: args.inwardKey }, outwardIssue: { key: args.outwardKey } };
    fetchAtlassian('/rest/api/3/issueLink', 'POST', body, (err) => {
      if (err) return sendErr(id, err);
      send(id, `Enlace creado: ${args.inwardKey} ←[${args.linkType || 'Relates'}]→ ${args.outwardKey}`);
    });
  },

  jira_get_link_types: (id, args, send, sendErr) => {
    fetchAtlassian('/rest/api/3/issueLinkType', 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const types = (res.issueLinkTypes || []).map(t => `${t.name} (inward: "${t.inward}" | outward: "${t.outward}")`);
      send(id, `Tipos de enlace (${types.length}):\n\n${types.join('\n')}`);
    });
  },

  jira_get_user: (id, args, send, sendErr) => {
    fetchAtlassian(`/rest/api/3/user/search?query=${encodeURIComponent(args.query)}&maxResults=10`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const users = Array.isArray(res) ? res : [];
      if (!users.length) return send(id, 'No se encontraron usuarios.');
      const lines = users.map(u => `${u.displayName} (accountId: ${u.accountId}, email: ${u.emailAddress || '-'})`);
      send(id, `Usuarios (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

  jira_get_fields: (id, args, send, sendErr) => {
    fetchAtlassian('/rest/api/3/field', 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const fields = (Array.isArray(res) ? res : []).map(f => `[${f.id}] ${f.name}${f.custom ? ' (custom)' : ''}`);
      send(id, `Campos (${fields.length}):\n\n${fields.join('\n')}`);
    });
  },

  jira_get_project_components: (id, args, send, sendErr) => {
    fetchAtlassian(`/rest/api/3/project/${encodeURIComponent(args.projectKey)}/components`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const comps = Array.isArray(res) ? res : [];
      if (!comps.length) return send(id, 'No hay componentes en este proyecto.');
      const lines = comps.map(c => `[${c.id}] ${c.name}${c.description ? ` — ${c.description}` : ''}`);
      send(id, `Componentes de ${args.projectKey}:\n\n${lines.join('\n')}`);
    });
  },

  jira_get_project_versions: (id, args, send, sendErr) => {
    fetchAtlassian(`/rest/api/3/project/${encodeURIComponent(args.projectKey)}/versions`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const versions = Array.isArray(res) ? res : [];
      if (!versions.length) return send(id, 'No hay versiones en este proyecto.');
      const lines = versions.map(v => `[${v.id}] ${v.name} | ${v.released ? 'Released' : 'Unreleased'}${v.releaseDate ? ` | ${v.releaseDate}` : ''}`);
      send(id, `Versiones de ${args.projectKey}:\n\n${lines.join('\n')}`);
    });
  },

  jira_get_changelogs: (id, args, send, sendErr) => {
    const max = args.maxResults || 10;
    fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}/changelog?maxResults=${max}`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const histories = res.values || [];
      if (!histories.length) return send(id, 'Sin historial de cambios.');
      const lines = histories.map(h => {
        const items = (h.items || []).map(i => `    ${i.field}: "${i.fromString || '-'}" → "${i.toString || '-'}"`).join('\n');
        return `[${h.created?.slice(0, 16)}] ${h.author?.displayName}\n${items}`;
      });
      send(id, `Changelog of ${args.key} (last ${histories.length}):\n\n${lines.join('\n\n')}`);
    });
  },

};
