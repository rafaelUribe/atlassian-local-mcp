const { fetchAtlassian } = require('../atlassian');
const { stripHtml }      = require('../atlassian');
const { ATLASSIAN_HOST } = require('../config');

module.exports = {

  confluence_search: (id, args, send, sendErr) => {
    const limit = Math.min(args.limit || 10, 50);
    const qs = new URLSearchParams({ cql: args.cql, limit, expand: 'space,version' }).toString();
    fetchAtlassian(`/wiki/rest/api/content/search?${qs}`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const results = res.results || [];
      if (!results.length) return send(id, 'No pages found.');
      const lines = results.map(p =>
        `[${p.id}] ${p.title}\n  Espacio: ${p.space?.name || p.space?.key} | Tipo: ${p.type} | URL: https://${ATLASSIAN_HOST}/wiki${p._links?.webui || ''}`
      );
      send(id, `${res.totalSize ?? results.length} result(s) (showing ${results.length}):\n\n${lines.join('\n\n')}`);
    });
  },

  confluence_get_page: (id, args, send, sendErr) => {
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}?expand=body.storage,version,ancestors,space`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const bodyText  = stripHtml(res.body?.storage?.value || '');
      const ancestors = (res.ancestors || []).map(a => a.title).join(' > ');
      const out = [
        `[${res.id}] ${res.title}`,
        `Espacio: ${res.space?.name} (${res.space?.key})`,
        ancestors ? `Ruta: ${ancestors} > ${res.title}` : '',
        `Version: ${res.version?.number} | Last modified: ${res.version?.when || '-'}`,
        `URL: https://${ATLASSIAN_HOST}/wiki${res._links?.webui || ''}`,
        `\nContenido:\n${bodyText || '(empty)'}`,
      ].filter(Boolean).join('\n');
      send(id, out);
    });
  },

  confluence_get_spaces: (id, args, send, sendErr) => {
    fetchAtlassian('/wiki/rest/api/space?limit=100&type=global&expand=description.plain', 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const spaces = (res.results || []).filter(s => !s.key.startsWith('~'));
      if (!spaces.length) return send(id, 'No global spaces found.');
      const lines = spaces.map(s =>
        `[${s.key}] ${s.name}${s.description?.plain?.value ? ` — ${s.description.plain.value.slice(0, 80)}` : ''}`
      );
      send(id, `Spaces (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

  confluence_get_space_pages: (id, args, send, sendErr) => {
    const limit = Math.min(args.limit || 20, 50);
    fetchAtlassian(`/wiki/rest/api/space/${encodeURIComponent(args.spaceKey)}/content/page?limit=${limit}&expand=version`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const pages = res.results || [];
      if (!pages.length) return send(id, `No pages in space "${args.spaceKey}".`);
      const lines = pages.map(p => `[${p.id}] ${p.title} (v${p.version?.number})`);
      send(id, `Pages in ${args.spaceKey} (${pages.length}):\n\n${lines.join('\n')}`);
    });
  },

  confluence_create_page: (id, args, send, sendErr) => {
    const body = {
      type: 'page', title: args.title,
      space: { key: args.spaceKey },
      body: { storage: { value: args.content, representation: 'storage' } },
    };
    if (args.parentId) body.ancestors = [{ id: args.parentId }];
    fetchAtlassian('/wiki/rest/api/content', 'POST', body, (err, res) => {
      if (err) return sendErr(id, err);
      send(id, `Page created: [${res.id}] ${res.title}\nURL: https://${ATLASSIAN_HOST}/wiki${res._links?.webui || ''}`);
    });
  },

  confluence_update_page: (id, args, send, sendErr) => {
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}?expand=version`, 'GET', null, (err, current) => {
      if (err) return sendErr(id, err);
      const newVersion = (current.version?.number || 0) + 1;
      const body = {
        type: 'page', title: args.title || current.title,
        version: { number: newVersion },
        body: { storage: { value: args.content, representation: 'storage' } },
      };
      fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}`, 'PUT', body, (err2, res) => {
        if (err2) return sendErr(id, err2);
        send(id, `Page updated: [${res.id}] ${res.title} (v${res.version?.number})\nURL: https://${ATLASSIAN_HOST}/wiki${res._links?.webui || ''}`);
      });
    });
  },

  confluence_delete_page: (id, args, send, sendErr) => {
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}`, 'DELETE', null, (err) => {
      if (err) return sendErr(id, err);
      send(id, `Page ${args.pageId} deleted.`);
    });
  },

  confluence_get_page_children: (id, args, send, sendErr) => {
    const limit = args.limit || 25;
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/child/page?limit=${limit}&expand=version`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const pages = res.results || [];
      if (!pages.length) return send(id, 'This page has no children.');
      const lines = pages.map(p => `[${p.id}] ${p.title}`);
      send(id, `Child pages of ${args.pageId} (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

  confluence_add_comment: (id, args, send, sendErr) => {
    const body = {
      type: 'comment',
      container: { id: args.pageId, type: 'page' },
      body: { storage: { value: `<p>${args.comment}</p>`, representation: 'storage' } },
    };
    fetchAtlassian('/wiki/rest/api/content', 'POST', body, (err, res) => {
      if (err) return sendErr(id, err);
      send(id, `Comment added to page ${args.pageId}. ID comentario: ${res.id}`);
    });
  },

  confluence_get_page_comments: (id, args, send, sendErr) => {
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/child/comment?expand=body.view,version`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const comments = res.results || [];
      if (!comments.length) return send(id, 'Sin comentarios.');
      const lines = comments.map(c =>
        `[${c.id}] ${c.version?.by?.displayName || '-'} (${c.version?.when?.slice(0, 10) || '-'}):\n  ${stripHtml(c.body?.view?.value || '').slice(0, 200)}`
      );
      send(id, `Comentarios (${lines.length}):\n\n${lines.join('\n\n')}`);
    });
  },

  confluence_get_page_labels: (id, args, send, sendErr) => {
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/label`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const labels = res.results || [];
      if (!labels.length) return send(id, 'Sin etiquetas.');
      send(id, `Labels: ${labels.map(l => l.name).join(', ')}`);
    });
  },

  confluence_add_page_label: (id, args, send, sendErr) => {
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/label`, 'POST', [{ prefix: 'global', name: args.label }], (err) => {
      if (err) return sendErr(id, err);
      send(id, `Label "${args.label}" added to page ${args.pageId}.`);
    });
  },

  confluence_get_page_attachments: (id, args, send, sendErr) => {
    fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/child/attachment`, 'GET', null, (err, res) => {
      if (err) return sendErr(id, err);
      const atts = res.results || [];
      if (!atts.length) return send(id, 'Sin adjuntos.');
      const lines = atts.map(a => `[${a.id}] ${a.title} (${a.metadata?.mediaType || '-'}) — ${a._links?.download || ''}`);
      send(id, `Adjuntos (${lines.length}):\n\n${lines.join('\n')}`);
    });
  },

};
