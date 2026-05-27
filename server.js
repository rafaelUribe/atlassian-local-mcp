require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────────
const ATLASSIAN_HOST = process.env.JIRA_HOST;
const ATLASSIAN_EMAIL = process.env.JIRA_EMAIL;
const ATLASSIAN_TOKEN = process.env.JIRA_TOKEN;
const BITBUCKET_WORKSPACE = process.env.BITBUCKET_WORKSPACE;

if (!ATLASSIAN_HOST || !ATLASSIAN_EMAIL || !ATLASSIAN_TOKEN) {
  process.stderr.write('ERROR: Faltan variables JIRA_HOST, JIRA_EMAIL o JIRA_TOKEN en .env\n');
  process.exit(1);
}

const auth = Buffer.from(`${ATLASSIAN_EMAIL}:${ATLASSIAN_TOKEN}`).toString('base64');

// ── Tool definitions ───────────────────────────────────────────────────────────
const TOOLS = [
  // ── Jira ────────────────────────────────────────────────────────────────────
  {
    name: 'jira_search_tickets',
    description: 'Busca incidencias en Jira usando una consulta JQL. Devuelve clave, resumen, estado, prioridad y asignado.',
    inputSchema: {
      type: 'object',
      properties: {
        jql: { type: 'string', description: 'Consulta JQL, p.ej. "project = ORA AND status = Open"' },
        maxResults: { type: 'number', description: 'Máximo de resultados (default 10, máx 50)' }
      },
      required: ['jql']
    }
  },
  {
    name: 'jira_get_ticket',
    description: 'Obtiene todos los detalles de un ticket Jira por su clave (p.ej. ORA-123): descripción, comentarios, subtareas, etiquetas, sprint y más.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Clave del ticket, p.ej. ORA-123' }
      },
      required: ['key']
    }
  },
  {
    name: 'jira_get_my_tickets',
    description: 'Lista los tickets asignados al usuario configurado en .env que están en curso o pendientes.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtrar por estado (opcional), p.ej. "In Progress"' }
      }
    }
  },
  {
    name: 'jira_get_projects',
    description: 'Lista todos los proyectos Jira disponibles con su clave y nombre.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'jira_get_sprints',
    description: 'Lista los sprints de un board/proyecto Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'number', description: 'ID del board de Jira' },
        state: { type: 'string', description: 'Estado del sprint: active | future | closed (default: active)' }
      },
      required: ['boardId']
    }
  },
  {
    name: 'jira_add_comment',
    description: 'Agrega un comentario de texto a un ticket Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Clave del ticket, p.ej. ORA-123' },
        comment: { type: 'string', description: 'Texto del comentario' }
      },
      required: ['key', 'comment']
    }
  },
  {
    name: 'jira_transition_ticket',
    description: 'Cambia el estado de un ticket Jira (p.ej. moverlo a "In Progress" o "Done").',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Clave del ticket' },
        transitionName: { type: 'string', description: 'Nombre de la transición, p.ej. "In Progress", "Done", "To Do"' }
      },
      required: ['key', 'transitionName']
    }
  },

  // ── Confluence ───────────────────────────────────────────────────────────────
  {
    name: 'confluence_search',
    description: 'Busca páginas y contenido en Confluence usando una consulta CQL. Devuelve título, espacio y URL.',
    inputSchema: {
      type: 'object',
      properties: {
        cql: { type: 'string', description: 'Consulta CQL, p.ej. "type=page AND space=ENG AND text~\\"deploy\\""' },
        maxResults: { type: 'number', description: 'Máximo de resultados (default 10, máx 50)' }
      },
      required: ['cql']
    }
  },
  {
    name: 'confluence_get_page',
    description: 'Obtiene el contenido completo de una página de Confluence por su ID.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID numérico de la página, p.ej. "123456"' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'confluence_get_spaces',
    description: 'Lista todos los espacios de Confluence disponibles con su clave y nombre.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'confluence_get_space_pages',
    description: 'Lista las páginas de un espacio de Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'Clave del espacio, p.ej. "ENG" o "TEAM"' },
        limit: { type: 'number', description: 'Máximo de páginas a devolver (default 20, máx 50)' }
      },
      required: ['spaceKey']
    }
  },
  {
    name: 'confluence_create_page',
    description: 'Crea una nueva página en Confluence dentro de un espacio dado.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceKey: { type: 'string', description: 'Clave del espacio donde crear la página' },
        title: { type: 'string', description: 'Título de la nueva página' },
        content: { type: 'string', description: 'Contenido en HTML o texto plano' },
        parentId: { type: 'string', description: 'ID de la página padre (opcional)' }
      },
      required: ['spaceKey', 'title', 'content']
    }
  },
  {
    name: 'confluence_update_page',
    description: 'Actualiza el contenido de una página existente en Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página a actualizar' },
        title: { type: 'string', description: 'Nuevo título (si se omite, se mantiene el actual)' },
        content: { type: 'string', description: 'Nuevo contenido en HTML o texto plano' }
      },
      required: ['pageId', 'content']
    }
  },

  // ── Jira — nuevos ────────────────────────────────────────────────────────────
  {
    name: 'jira_get_boards',
    description: 'Lista los boards (Scrum/Kanban) de Jira. Útil para obtener el boardId necesario en jira_get_sprints.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Filtrar por clave de proyecto (opcional), p.ej. "B2BBE"' },
        maxResults: { type: 'number', description: 'Máximo de resultados (default 20)' }
      }
    }
  },
  {
    name: 'jira_get_sprint_tickets',
    description: 'Lista los tickets del sprint activo (u otro estado) de un board de Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'number', description: 'ID del board de Jira' },
        sprintId: { type: 'number', description: 'ID del sprint (opcional; si se omite usa el sprint activo)' }
      },
      required: ['boardId']
    }
  },
  {
    name: 'jira_create_ticket',
    description: 'Crea un nuevo ticket (issue) en Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey:  { type: 'string',  description: 'Clave del proyecto, p.ej. "B2BBE"' },
        summary:     { type: 'string',  description: 'Resumen / título del ticket' },
        issueType:   { type: 'string',  description: 'Tipo: Story | Task | Bug | Sub-task (default: Task)' },
        description: { type: 'string',  description: 'Descripción en texto plano (opcional)' },
        priority:    { type: 'string',  description: 'Prioridad: Highest | High | Medium | Low | Lowest (opcional)' },
        assignee:    { type: 'string',  description: 'Account ID o email del asignado (opcional)' },
        labels:      { type: 'array', items: { type: 'string' }, description: 'Etiquetas (opcional)' },
        parentKey:   { type: 'string',  description: 'Clave del ticket padre si es Sub-task (opcional)' }
      },
      required: ['projectKey', 'summary']
    }
  },
  {
    name: 'jira_update_ticket',
    description: 'Actualiza campos de un ticket Jira existente (resumen, descripción, prioridad, asignado, etiquetas).',
    inputSchema: {
      type: 'object',
      properties: {
        key:         { type: 'string', description: 'Clave del ticket, p.ej. "B2BBE-123"' },
        summary:     { type: 'string', description: 'Nuevo resumen (opcional)' },
        description: { type: 'string', description: 'Nueva descripción en texto plano (opcional)' },
        priority:    { type: 'string', description: 'Nueva prioridad (opcional)' },
        assignee:    { type: 'string', description: 'Account ID o email del nuevo asignado (opcional)' },
        labels:      { type: 'array', items: { type: 'string' }, description: 'Nuevas etiquetas (reemplaza las actuales)' }
      },
      required: ['key']
    }
  },
  {
    name: 'jira_get_transitions',
    description: 'Lista las transiciones disponibles para un ticket Jira (estados a los que se puede mover).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Clave del ticket, p.ej. "B2BBE-123"' }
      },
      required: ['key']
    }
  },
  {
    name: 'jira_delete_comment',
    description: 'Elimina un comentario de un ticket Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        key:       { type: 'string', description: 'Clave del ticket' },
        commentId: { type: 'string', description: 'ID del comentario a eliminar' }
      },
      required: ['key', 'commentId']
    }
  },
  {
    name: 'jira_get_issue_types',
    description: 'Lista los tipos de issue disponibles en un proyecto Jira (Story, Bug, Task, Sub-task, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Clave del proyecto (opcional; sin clave devuelve todos los tipos globales)' }
      }
    }
  },
  {
    name: 'jira_link_issues',
    description: 'Crea un enlace entre dos tickets Jira (p.ej. "blocks", "is blocked by", "relates to").',
    inputSchema: {
      type: 'object',
      properties: {
        inwardKey:  { type: 'string', description: 'Clave del ticket origen' },
        outwardKey: { type: 'string', description: 'Clave del ticket destino' },
        linkType:   { type: 'string', description: 'Tipo de enlace, p.ej. "Blocks", "Relates", "Cloners" (default: "Relates")' }
      },
      required: ['inwardKey', 'outwardKey']
    }
  },
  {
    name: 'jira_get_link_types',
    description: 'Lista todos los tipos de enlace disponibles en Jira.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'jira_get_user',
    description: 'Busca usuarios en Jira por nombre o email. Útil para obtener accountId para asignaciones.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nombre o email del usuario a buscar' }
      },
      required: ['query']
    }
  },
  {
    name: 'jira_get_fields',
    description: 'Lista todos los campos personalizados disponibles en Jira.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'jira_get_project_components',
    description: 'Lista los componentes de un proyecto Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Clave del proyecto' }
      },
      required: ['projectKey']
    }
  },
  {
    name: 'jira_get_project_versions',
    description: 'Lista las versiones (Fix Versions) de un proyecto Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'Clave del proyecto' }
      },
      required: ['projectKey']
    }
  },
  {
    name: 'jira_get_changelogs',
    description: 'Devuelve el historial de cambios (changelog) de un ticket Jira.',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Clave del ticket' },
        maxResults: { type: 'number', description: 'Últimos N cambios (default 10)' }
      },
      required: ['key']
    }
  },

  // ── Confluence — nuevos ───────────────────────────────────────────────────────
  {
    name: 'confluence_delete_page',
    description: 'Elimina una página de Confluence por su ID.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página a eliminar' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'confluence_get_page_children',
    description: 'Lista las páginas hijas de una página de Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página padre' },
        limit:  { type: 'number', description: 'Máximo de resultados (default 25)' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'confluence_add_comment',
    description: 'Agrega un comentario a una página de Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId:  { type: 'string', description: 'ID de la página' },
        comment: { type: 'string', description: 'Texto del comentario' }
      },
      required: ['pageId', 'comment']
    }
  },
  {
    name: 'confluence_get_page_comments',
    description: 'Lista los comentarios de una página de Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'confluence_get_page_labels',
    description: 'Lista las etiquetas (labels) de una página de Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'confluence_add_page_label',
    description: 'Agrega una etiqueta (label) a una página de Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página' },
        label:  { type: 'string', description: 'Etiqueta a agregar' }
      },
      required: ['pageId', 'label']
    }
  },
  {
    name: 'confluence_get_page_attachments',
    description: 'Lista los adjuntos de una página de Confluence.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página' }
      },
      required: ['pageId']
    }
  },

  // ── Bitbucket ────────────────────────────────────────────────────────────────
  {
    name: 'bitbucket_get_repos',
    description: 'Lista los repositorios del workspace de Bitbucket configurado en BITBUCKET_WORKSPACE.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filtro opcional por nombre de repositorio' }
      }
    }
  },
  {
    name: 'bitbucket_get_pull_requests',
    description: 'Lista los pull requests de un repositorio de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Slug del repositorio, p.ej. "my-service"' },
        state: { type: 'string', description: 'Estado: OPEN | MERGED | DECLINED | SUPERSEDED (default: OPEN)' }
      },
      required: ['repo']
    }
  },
  {
    name: 'bitbucket_get_pull_request',
    description: 'Obtiene los detalles completos de un pull request específico de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Slug del repositorio' },
        prId: { type: 'number', description: 'ID numérico del pull request' }
      },
      required: ['repo', 'prId']
    }
  },
  {
    name: 'bitbucket_create_pull_request',
    description: 'Crea un nuevo pull request en un repositorio de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Slug del repositorio' },
        title: { type: 'string', description: 'Título del pull request' },
        sourceBranch: { type: 'string', description: 'Rama de origen' },
        targetBranch: { type: 'string', description: 'Rama de destino (default: main o master)' },
        description: { type: 'string', description: 'Descripción del pull request (opcional)' },
        reviewers: { type: 'array', items: { type: 'string' }, description: 'Lista de usernames de revisores (opcional)' }
      },
      required: ['repo', 'title', 'sourceBranch']
    }
  },
  {
    name: 'bitbucket_add_pr_comment',
    description: 'Agrega un comentario a un pull request de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Slug del repositorio' },
        prId: { type: 'number', description: 'ID del pull request' },
        comment: { type: 'string', description: 'Texto del comentario' }
      },
      required: ['repo', 'prId', 'comment']
    }
  },
  {
    name: 'bitbucket_get_branches',
    description: 'Lista las ramas de un repositorio de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Slug del repositorio' },
        filter: { type: 'string', description: 'Filtro opcional por nombre de rama' }
      },
      required: ['repo']
    }
  },
  {
    name: 'bitbucket_get_commits',
    description: 'Lista los commits de una rama de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:    { type: 'string', description: 'Slug del repositorio' },
        branch:  { type: 'string', description: 'Nombre de la rama (opcional; si se omite, rama por defecto)' },
        limit:   { type: 'number', description: 'Máximo de commits a devolver (default 20)' }
      },
      required: ['repo']
    }
  },
  {
    name: 'bitbucket_get_diff',
    description: 'Obtiene el diff de un pull request de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:  { type: 'string', description: 'Slug del repositorio' },
        prId:  { type: 'number', description: 'ID del pull request' }
      },
      required: ['repo', 'prId']
    }
  },
  {
    name: 'bitbucket_approve_pr',
    description: 'Aprueba un pull request de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:  { type: 'string', description: 'Slug del repositorio' },
        prId:  { type: 'number', description: 'ID del pull request' }
      },
      required: ['repo', 'prId']
    }
  },
  {
    name: 'bitbucket_unapprove_pr',
    description: 'Retira la aprobación de un pull request de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:  { type: 'string', description: 'Slug del repositorio' },
        prId:  { type: 'number', description: 'ID del pull request' }
      },
      required: ['repo', 'prId']
    }
  },
  {
    name: 'bitbucket_merge_pr',
    description: 'Hace merge de un pull request de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:           { type: 'string', description: 'Slug del repositorio' },
        prId:           { type: 'number', description: 'ID del pull request' },
        mergeStrategy:  { type: 'string', description: 'Estrategia: merge_commit | squash | fast_forward (default: merge_commit)' },
        message:        { type: 'string', description: 'Mensaje del commit de merge (opcional)' }
      },
      required: ['repo', 'prId']
    }
  },
  {
    name: 'bitbucket_decline_pr',
    description: 'Rechaza (declina) un pull request de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:  { type: 'string', description: 'Slug del repositorio' },
        prId:  { type: 'number', description: 'ID del pull request' }
      },
      required: ['repo', 'prId']
    }
  },
  {
    name: 'bitbucket_get_pr_comments',
    description: 'Lista todos los comentarios de un pull request de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:  { type: 'string', description: 'Slug del repositorio' },
        prId:  { type: 'number', description: 'ID del pull request' }
      },
      required: ['repo', 'prId']
    }
  },
  {
    name: 'bitbucket_get_file',
    description: 'Obtiene el contenido de un archivo en una rama de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:   { type: 'string', description: 'Slug del repositorio' },
        path:   { type: 'string', description: 'Ruta del archivo, p.ej. "src/Main.java"' },
        branch: { type: 'string', description: 'Rama (default: rama principal del repo)' }
      },
      required: ['repo', 'path']
    }
  },
  {
    name: 'bitbucket_get_pipelines',
    description: 'Lista las pipelines recientes de un repositorio de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:   { type: 'string', description: 'Slug del repositorio' },
        limit:  { type: 'number', description: 'Máximo de pipelines (default 10)' }
      },
      required: ['repo']
    }
  },
  {
    name: 'bitbucket_get_pipeline',
    description: 'Obtiene los detalles de una pipeline específica de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {
        repo:       { type: 'string', description: 'Slug del repositorio' },
        pipelineId: { type: 'string', description: 'UUID o número de la pipeline' }
      },
      required: ['repo', 'pipelineId']
    }
  },
  {
    name: 'bitbucket_list_workspace_members',
    description: 'Lista los miembros del workspace de Bitbucket.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // ── Meta ─────────────────────────────────────────────────────────────────────
  {
    name: 'mcp_get_agent_context',
    description: 'Returns the agents-template.md content — workflow instructions for AI agents (Confluence docs workflow, ticket init, progress logging, git conventions). Call this at the start of every session to load context.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// ── Transport: stdio or HTTP ───────────────────────────────────────────────────
const HTTP_PORT = process.env.HTTP_PORT || (process.argv.includes('--http') && (process.argv[process.argv.indexOf('--http') + 1] || '3847'));
const HTTP_BIND = process.env.HTTP_BIND || (process.argv.includes('--host') && (process.argv[process.argv.indexOf('--host') + 1])) || '0.0.0.0';

if (HTTP_PORT && !isNaN(Number(HTTP_PORT))) {
  startHttpServer(Number(HTTP_PORT), HTTP_BIND);
} else if (process.argv.includes('--http')) {
  startHttpServer(3847, HTTP_BIND);
} else {
  startStdioServer();
}

function startStdioServer() {
  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { handleRequest(JSON.parse(line), stdioRespond); } catch (e) { /* ignore parse errors */ }
    }
  });
}

function stdioRespond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function startHttpServer(port, bindHost) {
  const http = require('http');
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method !== 'POST') { res.writeHead(405); return res.end('Method Not Allowed'); }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      }
      handleRequest(parsed, (id, result) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
      });
    });
  });

  server.listen(port, bindHost, () => {
    const displayedHost = bindHost === '0.0.0.0' ? 'localhost' : bindHost;
    const url = `http://${displayedHost}:${port}/`;
    process.stderr.write(`Atlassian MCP HTTP server listening on ${url}\n`);

    // write minimal info file so other agents can discover the MCP URL (no secrets)
    const infoPath = path.join(__dirname, 'mcp.info');
    const info = { url, host: bindHost, port: Number(port), pid: process.pid, startedAt: new Date().toISOString() };
    try {
      fs.writeFileSync(infoPath, JSON.stringify(info, null, 2), { encoding: 'utf8' });
      process.stderr.write(`MCP info written to ${infoPath}\n`);
    } catch (e) {
      process.stderr.write(`Failed writing MCP info: ${e.message}\n`);
    }
  });
}

// ── Request dispatcher ─────────────────────────────────────────────────────────
function handleRequest(req, respondFn) {
  if (req.method === 'initialize') {
    return respondFn(req.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'atlassian-local-mcp', version: '1.0.0' }
    });
  }

  if (req.method === 'notifications/initialized') return;

  if (req.method === 'tools/list') {
    return respondFn(req.id, { tools: TOOLS });
  }

  if (req.method === 'tools/call') {
    const { name, arguments: args = {} } = req.params;
    return dispatchTool(req.id, name, args, respondFn);
  }

  respondFn(req.id, { content: [{ type: 'text', text: `Método desconocido: ${req.method}` }] });
}

// ── Tool dispatch ──────────────────────────────────────────────────────────────
function dispatchTool(id, name, args, respondFn) {
  const sendText = (i, text) => respondFn(i, { content: [{ type: 'text', text }] });
  const sendError = (i, err) => respondFn(i, { isError: true, content: [{ type: 'text', text: err.message }] });

  switch (name) {

    // ── Jira tools ─────────────────────────────────────────────────────────────
    case 'jira_search_tickets': {
      const max = Math.min(args.maxResults || 10, 50);
      const searchBody = { jql: args.jql, maxResults: max, fields: ['summary','status','priority','assignee','issuetype'] };
      return fetchAtlassian(`/rest/api/3/search/jql`, 'POST', searchBody, (err, res) => {
        if (err) return sendError(id, err);
        if (!res.issues?.length) return sendText(id, 'No se encontraron tickets.');
        const lines = res.issues.map(i => {
          const assignee = i.fields.assignee?.displayName || 'Sin asignar';
          const priority = i.fields.priority?.name || '-';
          return `[${i.key}] ${i.fields.summary}\n  Estado: ${i.fields.status.name} | Prioridad: ${priority} | Asignado: ${assignee}`;
        });
        sendText(id, `${res.total} resultado(s) (mostrando ${res.issues.length}):\n\n${lines.join('\n\n')}`);
      });
    }

    case 'jira_get_ticket': {
      const path = `/rest/api/3/issue/${encodeURIComponent(args.key)}?fields=summary,status,priority,assignee,description,comment,subtasks,labels,issuetype,sprint,customfield_10020`;
      return fetchAtlassian(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const f = res.fields;
        const desc = extractText(f.description);
        const comments = (f.comment?.comments || []).slice(-3).map(c =>
          `  [${c.author.displayName}]: ${extractText(c.body)}`
        ).join('\n');
        const subtasks = (f.subtasks || []).map(s => `  • [${s.key}] ${s.fields.summary} (${s.fields.status.name})`).join('\n');
        const sprint = f.customfield_10020?.find(s => s.state === 'active')?.name || 'Sin sprint activo';
        const labels = (f.labels || []).join(', ') || 'Ninguna';
        const out = [
          `[${res.key}] ${f.summary}`,
          `Tipo: ${f.issuetype?.name} | Estado: ${f.status.name} | Prioridad: ${f.priority?.name || '-'}`,
          `Asignado: ${f.assignee?.displayName || 'Sin asignar'} | Sprint: ${sprint}`,
          `Etiquetas: ${labels}`,
          `\nDescripción:\n${desc || '(vacía)'}`,
          subtasks ? `\nSubtareas:\n${subtasks}` : '',
          comments ? `\nÚltimos comentarios:\n${comments}` : ''
        ].filter(Boolean).join('\n');
        sendText(id, out);
      });
    }

    case 'jira_get_my_tickets': {
      let jql = `assignee = "${ATLASSIAN_EMAIL}" AND statusCategory != Done ORDER BY updated DESC`;
      if (args.status) jql = `assignee = "${ATLASSIAN_EMAIL}" AND status = "${args.status}" ORDER BY updated DESC`;
      const searchBody = { jql, maxResults: 20, fields: ['summary','status','priority','issuetype'] };
      return fetchAtlassian(`/rest/api/3/search/jql`, 'POST', searchBody, (err, res) => {
        if (err) return sendError(id, err);
        if (!res.issues?.length) return sendText(id, 'No tienes tickets asignados actualmente.');
        const lines = res.issues.map(i =>
          `[${i.key}] ${i.fields.summary} — ${i.fields.status.name} (${i.fields.issuetype?.name})`
        );
        sendText(id, `Tus tickets (${res.issues.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'jira_get_projects': {
      return fetchAtlassian('/rest/api/3/project?expand=description', 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const lines = res.map(p => `[${p.key}] ${p.name}${p.description ? ` — ${p.description}` : ''}`);
        sendText(id, `Proyectos (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'jira_get_sprints': {
      const state = args.state || 'active';
      return fetchAtlassian(`/rest/agile/1.0/board/${args.boardId}/sprint?state=${state}`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const sprints = res.values || [];
        if (!sprints.length) return sendText(id, `No hay sprints con estado "${state}".`);
        const lines = sprints.map(s => `[${s.id}] ${s.name} | ${s.state} | ${s.startDate || '?'} → ${s.endDate || '?'}`);
        sendText(id, lines.join('\n'));
      });
    }

    case 'jira_add_comment': {
      const path = `/rest/api/3/issue/${encodeURIComponent(args.key)}/comment`;
      const body = {
        body: {
          type: 'doc', version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: args.comment }] }]
        }
      };
      return fetchAtlassian(path, 'POST', body, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Comentario agregado a ${args.key}.`);
      });
    }

    case 'jira_transition_ticket': {
      const transPath = `/rest/api/3/issue/${encodeURIComponent(args.key)}/transitions`;
      return fetchAtlassian(transPath, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const transition = (res.transitions || []).find(t =>
          t.name.toLowerCase() === args.transitionName.toLowerCase()
        );
        if (!transition) {
          const available = (res.transitions || []).map(t => t.name).join(', ');
          return sendText(id, `Transición "${args.transitionName}" no encontrada. Disponibles: ${available}`);
        }
        fetchAtlassian(transPath, 'POST', { transition: { id: transition.id } }, (err2) => {
          if (err2) return sendError(id, err2);
          sendText(id, `${args.key} movido a "${transition.name}".`);
        });
      });
    }

    case 'jira_get_boards': {
      let qs = `maxResults=${args.maxResults || 20}`;
      if (args.projectKey) qs += `&projectKeyOrId=${encodeURIComponent(args.projectKey)}`;
      return fetchAtlassian(`/rest/agile/1.0/board?${qs}`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const boards = res.values || [];
        if (!boards.length) return sendText(id, 'No se encontraron boards.');
        const lines = boards.map(b => `[${b.id}] ${b.name} (${b.type}) — Proyecto: ${b.location?.projectKey || '-'}`);
        sendText(id, `Boards (${boards.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'jira_get_sprint_tickets': {
      const getSprint = (cb) => {
        if (args.sprintId) return cb(null, args.sprintId);
        fetchAtlassian(`/rest/agile/1.0/board/${args.boardId}/sprint?state=active`, 'GET', null, (err, res) => {
          if (err) return cb(err);
          const sprint = (res.values || [])[0];
          if (!sprint) return cb(new Error('No hay sprint activo en este board.'));
          cb(null, sprint.id);
        });
      };
      return getSprint((err, sprintId) => {
        if (err) return sendError(id, err);
        fetchAtlassian(`/rest/agile/1.0/sprint/${sprintId}/issue?fields=summary,status,priority,assignee,issuetype`, 'GET', null, (err2, res) => {
          if (err2) return sendError(id, err2);
          const issues = res.issues || [];
          if (!issues.length) return sendText(id, 'Sprint sin tickets.');
          const lines = issues.map(i =>
            `[${i.key}] ${i.fields.summary}\n  ${i.fields.status.name} | ${i.fields.assignee?.displayName || 'Sin asignar'}`
          );
          sendText(id, `Tickets del sprint (${issues.length}):\n\n${lines.join('\n\n')}`);
        });
      });
    }

    case 'jira_create_ticket': {
      const fields = {
        project:   { key: args.projectKey },
        summary:   args.summary,
        issuetype: { name: args.issueType || 'Task' }
      };
      if (args.description) fields.description = {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }]
      };
      if (args.priority) fields.priority = { name: args.priority };
      if (args.labels?.length) fields.labels = args.labels;
      if (args.assignee) fields.assignee = { id: args.assignee };
      if (args.parentKey) fields.parent = { key: args.parentKey };
      return fetchAtlassian('/rest/api/3/issue', 'POST', { fields }, (err, res) => {
        if (err) return sendError(id, err);
        sendText(id, `Ticket creado: [${res.key}]\nURL: https://${ATLASSIAN_HOST}/browse/${res.key}`);
      });
    }

    case 'jira_update_ticket': {
      const fields = {};
      if (args.summary) fields.summary = args.summary;
      if (args.priority) fields.priority = { name: args.priority };
      if (args.labels) fields.labels = args.labels;
      if (args.assignee) fields.assignee = { id: args.assignee };
      if (args.description) fields.description = {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: args.description }] }]
      };
      return fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}`, 'PUT', { fields }, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Ticket ${args.key} actualizado.`);
      });
    }

    case 'jira_get_transitions': {
      return fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}/transitions`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const transitions = res.transitions || [];
        const lines = transitions.map(t => `[${t.id}] ${t.name} → ${t.to?.name}`);
        sendText(id, `Transiciones disponibles para ${args.key}:\n\n${lines.join('\n')}`);
      });
    }

    case 'jira_delete_comment': {
      return fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}/comment/${encodeURIComponent(args.commentId)}`, 'DELETE', null, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Comentario ${args.commentId} eliminado de ${args.key}.`);
      });
    }

    case 'jira_get_issue_types': {
      if (args.projectKey) {
        return fetchAtlassian(`/rest/api/3/issuetype/project?projectId=${encodeURIComponent(args.projectKey)}`, 'GET', null, (err, res) => {
          if (err) {
            // fallback: search by key
            return fetchAtlassian(`/rest/api/3/project/${encodeURIComponent(args.projectKey)}?expand=issueTypes`, 'GET', null, (err2, res2) => {
              if (err2) return sendError(id, err2);
              const types = (res2.issueTypes || []).map(t => `[${t.id}] ${t.name} — ${t.description || ''}`);
              sendText(id, `Tipos en ${args.projectKey}:\n\n${types.join('\n')}`);
            });
          }
          const types = (Array.isArray(res) ? res : []).map(t => `[${t.id}] ${t.name}`);
          sendText(id, `Tipos en ${args.projectKey}:\n\n${types.join('\n')}`);
        });
      }
      return fetchAtlassian('/rest/api/3/issuetype', 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const types = (Array.isArray(res) ? res : []).map(t => `[${t.id}] ${t.name} — ${t.description || ''}`);
        sendText(id, `Tipos de issue globales (${types.length}):\n\n${types.join('\n')}`);
      });
    }

    case 'jira_link_issues': {
      const body = {
        type: { name: args.linkType || 'Relates' },
        inwardIssue:  { key: args.inwardKey },
        outwardIssue: { key: args.outwardKey }
      };
      return fetchAtlassian('/rest/api/3/issueLink', 'POST', body, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Enlace creado: ${args.inwardKey} ←[${args.linkType || 'Relates'}]→ ${args.outwardKey}`);
      });
    }

    case 'jira_get_link_types': {
      return fetchAtlassian('/rest/api/3/issueLinkType', 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const types = (res.issueLinkTypes || []).map(t => `${t.name} (inward: "${t.inward}" | outward: "${t.outward}")`);
        sendText(id, `Tipos de enlace (${types.length}):\n\n${types.join('\n')}`);
      });
    }

    case 'jira_get_user': {
      return fetchAtlassian(`/rest/api/3/user/search?query=${encodeURIComponent(args.query)}&maxResults=10`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const users = Array.isArray(res) ? res : [];
        if (!users.length) return sendText(id, 'No se encontraron usuarios.');
        const lines = users.map(u => `${u.displayName} (accountId: ${u.accountId}, email: ${u.emailAddress || '-'})`);
        sendText(id, `Usuarios (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'jira_get_fields': {
      return fetchAtlassian('/rest/api/3/field', 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const fields = (Array.isArray(res) ? res : []).map(f => `[${f.id}] ${f.name}${f.custom ? ' (custom)' : ''}`);
        sendText(id, `Campos (${fields.length}):\n\n${fields.join('\n')}`);
      });
    }

    case 'jira_get_project_components': {
      return fetchAtlassian(`/rest/api/3/project/${encodeURIComponent(args.projectKey)}/components`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const comps = Array.isArray(res) ? res : [];
        if (!comps.length) return sendText(id, 'No hay componentes en este proyecto.');
        const lines = comps.map(c => `[${c.id}] ${c.name}${c.description ? ` — ${c.description}` : ''}`);
        sendText(id, `Componentes de ${args.projectKey}:\n\n${lines.join('\n')}`);
      });
    }

    case 'jira_get_project_versions': {
      return fetchAtlassian(`/rest/api/3/project/${encodeURIComponent(args.projectKey)}/versions`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const versions = Array.isArray(res) ? res : [];
        if (!versions.length) return sendText(id, 'No hay versiones en este proyecto.');
        const lines = versions.map(v => `[${v.id}] ${v.name} | ${v.released ? 'Released' : 'Unreleased'}${v.releaseDate ? ` | ${v.releaseDate}` : ''}`);
        sendText(id, `Versiones de ${args.projectKey}:\n\n${lines.join('\n')}`);
      });
    }

    case 'jira_get_changelogs': {
      const max = args.maxResults || 10;
      return fetchAtlassian(`/rest/api/3/issue/${encodeURIComponent(args.key)}/changelog?maxResults=${max}`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const histories = res.values || [];
        if (!histories.length) return sendText(id, 'Sin historial de cambios.');
        const lines = histories.map(h => {
          const items = (h.items || []).map(i => `    ${i.field}: "${i.fromString || '-'}" → "${i.toString || '-'}"`).join('\n');
          return `[${h.created?.slice(0, 16)}] ${h.author?.displayName}\n${items}`;
        });
        sendText(id, `Changelog de ${args.key} (últimos ${histories.length}):\n\n${lines.join('\n\n')}`);
      });
    }

    // ── Confluence tools ───────────────────────────────────────────────────────
    case 'confluence_search': {
      const limit = Math.min(args.maxResults || 10, 50);
      const qs = new URLSearchParams({ cql: args.cql, limit, expand: 'space,version' }).toString();
      return fetchAtlassian(`/wiki/rest/api/content/search?${qs}`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const results = res.results || [];
        if (!results.length) return sendText(id, 'No se encontraron páginas.');
        const lines = results.map(p =>
          `[${p.id}] ${p.title}\n  Espacio: ${p.space?.name || p.space?.key} | Tipo: ${p.type} | URL: https://${ATLASSIAN_HOST}/wiki${p._links?.webui || ''}`
        );
        sendText(id, `${res.totalSize ?? results.length} resultado(s) (mostrando ${results.length}):\n\n${lines.join('\n\n')}`);
      });
    }

    case 'confluence_get_page': {
      const qs = 'expand=body.storage,version,ancestors,space';
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}?${qs}`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const bodyText = stripHtml(res.body?.storage?.value || '');
        const ancestors = (res.ancestors || []).map(a => a.title).join(' > ');
        const out = [
          `[${res.id}] ${res.title}`,
          `Espacio: ${res.space?.name} (${res.space?.key})`,
          ancestors ? `Ruta: ${ancestors} > ${res.title}` : '',
          `Versión: ${res.version?.number} | Última modificación: ${res.version?.when || '-'}`,
          `URL: https://${ATLASSIAN_HOST}/wiki${res._links?.webui || ''}`,
          `\nContenido:\n${bodyText || '(vacío)'}`
        ].filter(Boolean).join('\n');
        sendText(id, out);
      });
    }

    case 'confluence_get_spaces': {
      return fetchAtlassian('/wiki/rest/api/space?limit=50&expand=description.plain', 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const spaces = res.results || [];
        if (!spaces.length) return sendText(id, 'No se encontraron espacios.');
        const lines = spaces.map(s =>
          `[${s.key}] ${s.name}${s.description?.plain?.value ? ` — ${s.description.plain.value.slice(0, 80)}` : ''}`
        );
        sendText(id, `Espacios (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'confluence_get_space_pages': {
      const limit = Math.min(args.limit || 20, 50);
      const qs = `limit=${limit}&expand=version`;
      return fetchAtlassian(`/wiki/rest/api/space/${encodeURIComponent(args.spaceKey)}/content/page?${qs}`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const pages = res.results || [];
        if (!pages.length) return sendText(id, `No hay páginas en el espacio "${args.spaceKey}".`);
        const lines = pages.map(p =>
          `[${p.id}] ${p.title} (v${p.version?.number})`
        );
        sendText(id, `Páginas en ${args.spaceKey} (${pages.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'confluence_create_page': {
      const body = {
        type: 'page',
        title: args.title,
        space: { key: args.spaceKey },
        body: {
          storage: {
            value: args.content,
            representation: 'storage'
          }
        }
      };
      if (args.parentId) body.ancestors = [{ id: args.parentId }];
      return fetchAtlassian('/wiki/rest/api/content', 'POST', body, (err, res) => {
        if (err) return sendError(id, err);
        sendText(id, `Página creada: [${res.id}] ${res.title}\nURL: https://${ATLASSIAN_HOST}/wiki${res._links?.webui || ''}`);
      });
    }

    case 'confluence_update_page': {
      // First fetch the current page to get version number and title
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}?expand=version`, 'GET', null, (err, current) => {
        if (err) return sendError(id, err);
        const newVersion = (current.version?.number || 0) + 1;
        const body = {
          type: 'page',
          title: args.title || current.title,
          version: { number: newVersion },
          body: {
            storage: {
              value: args.content,
              representation: 'storage'
            }
          }
        };
        fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}`, 'PUT', body, (err2, res) => {
          if (err2) return sendError(id, err2);
          sendText(id, `Página actualizada: [${res.id}] ${res.title} (v${res.version?.number})\nURL: https://${ATLASSIAN_HOST}/wiki${res._links?.webui || ''}`);
        });
      });
    }

    case 'confluence_delete_page': {
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}`, 'DELETE', null, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Página ${args.pageId} eliminada.`);
      });
    }

    case 'confluence_get_page_children': {
      const limit = args.limit || 25;
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/child/page?limit=${limit}&expand=version`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const pages = res.results || [];
        if (!pages.length) return sendText(id, 'Esta página no tiene hijos.');
        const lines = pages.map(p => `[${p.id}] ${p.title}`);
        sendText(id, `Páginas hijas de ${args.pageId} (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'confluence_add_comment': {
      const body = {
        type: 'comment',
        container: { id: args.pageId, type: 'page' },
        body: {
          storage: {
            value: `<p>${args.comment}</p>`,
            representation: 'storage'
          }
        }
      };
      return fetchAtlassian('/wiki/rest/api/content', 'POST', body, (err, res) => {
        if (err) return sendError(id, err);
        sendText(id, `Comentario agregado a la página ${args.pageId}. ID comentario: ${res.id}`);
      });
    }

    case 'confluence_get_page_comments': {
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/child/comment?expand=body.view,version`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const comments = res.results || [];
        if (!comments.length) return sendText(id, 'Sin comentarios.');
        const lines = comments.map(c => `[${c.id}] ${c.version?.by?.displayName || '-'} (${c.version?.when?.slice(0,10) || '-'}):\n  ${stripHtml(c.body?.view?.value || '').slice(0, 200)}`);
        sendText(id, `Comentarios (${lines.length}):\n\n${lines.join('\n\n')}`);
      });
    }

    case 'confluence_get_page_labels': {
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/label`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const labels = res.results || [];
        if (!labels.length) return sendText(id, 'Sin etiquetas.');
        sendText(id, `Etiquetas: ${labels.map(l => l.name).join(', ')}`);
      });
    }

    case 'confluence_add_page_label': {
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/label`, 'POST', [{ prefix: 'global', name: args.label }], (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Etiqueta "${args.label}" agregada a la página ${args.pageId}.`);
      });
    }

    case 'confluence_get_page_attachments': {
      return fetchAtlassian(`/wiki/rest/api/content/${encodeURIComponent(args.pageId)}/child/attachment`, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const atts = res.results || [];
        if (!atts.length) return sendText(id, 'Sin adjuntos.');
        const lines = atts.map(a => `[${a.id}] ${a.title} (${a.metadata?.mediaType || '-'}) — ${a._links?.download || ''}`);
        sendText(id, `Adjuntos (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    // ── Bitbucket tools ────────────────────────────────────────────────────────
    case 'bitbucket_get_repos': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      let path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}?pagelen=50&sort=-updated_on`;
      if (args.filter) path += `&q=name~"${encodeURIComponent(args.filter)}"`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const repos = res.values || [];
        if (!repos.length) return sendText(id, 'No se encontraron repositorios.');
        const lines = repos.map(r =>
          `${r.slug} — ${r.description || '(sin descripción)'} | ${r.scm.toUpperCase()} | ${r.is_private ? 'Privado' : 'Público'}`
        );
        sendText(id, `Repositorios en ${BITBUCKET_WORKSPACE} (${repos.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'bitbucket_get_pull_requests': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const state = args.state || 'OPEN';
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests?state=${state}&pagelen=20`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const prs = res.values || [];
        if (!prs.length) return sendText(id, `No hay pull requests con estado "${state}".`);
        const lines = prs.map(pr =>
          `[#${pr.id}] ${pr.title}\n  ${pr.source?.branch?.name} → ${pr.destination?.branch?.name} | Autor: ${pr.author?.display_name} | ${pr.state}`
        );
        sendText(id, `Pull requests en ${args.repo} (${prs.length}):\n\n${lines.join('\n\n')}`);
      });
    }

    case 'bitbucket_get_pull_request': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}`;
      return fetchBitbucket(path, 'GET', null, (err, pr) => {
        if (err) return sendError(id, err);
        const reviewers = (pr.reviewers || []).map(r => r.display_name).join(', ') || 'Ninguno';
        const out = [
          `[#${pr.id}] ${pr.title}`,
          `Estado: ${pr.state} | Autor: ${pr.author?.display_name}`,
          `${pr.source?.branch?.name} → ${pr.destination?.branch?.name}`,
          `Revisores: ${reviewers}`,
          `Creado: ${pr.created_on?.slice(0, 10)} | Actualizado: ${pr.updated_on?.slice(0, 10)}`,
          pr.description ? `\nDescripción:\n${pr.description}` : '',
          `\nURL: ${pr.links?.html?.href || ''}`
        ].filter(Boolean).join('\n');
        sendText(id, out);
      });
    }

    case 'bitbucket_create_pull_request': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests`;
      const body = {
        title: args.title,
        description: args.description || '',
        source: { branch: { name: args.sourceBranch } },
        destination: { branch: { name: args.targetBranch || 'main' } },
        reviewers: (args.reviewers || []).map(username => ({ username })),
        close_source_branch: false
      };
      return fetchBitbucket(path, 'POST', body, (err, pr) => {
        if (err) return sendError(id, err);
        sendText(id, `Pull request creado: [#${pr.id}] ${pr.title}\nURL: ${pr.links?.html?.href || ''}`);
      });
    }

    case 'bitbucket_add_pr_comment': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/comments`;
      return fetchBitbucket(path, 'POST', { content: { raw: args.comment } }, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Comentario agregado al PR #${args.prId}.`);
      });
    }

    case 'bitbucket_get_branches': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      let path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/refs/branches?pagelen=30&sort=-target.date`;
      if (args.filter) path += `&q=name~"${encodeURIComponent(args.filter)}"`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const branches = res.values || [];
        if (!branches.length) return sendText(id, 'No se encontraron ramas.');
        const lines = branches.map(b => `${b.name} — último commit: ${b.target?.hash?.slice(0, 7) || '?'} (${b.target?.date?.slice(0, 10) || '?'})`);
        sendText(id, `Ramas en ${args.repo} (${branches.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'bitbucket_get_commits': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const limit = args.limit || 20;
      let path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/commits?pagelen=${limit}`;
      if (args.branch) path += `&include=${encodeURIComponent(args.branch)}`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const commits = res.values || [];
        if (!commits.length) return sendText(id, 'No se encontraron commits.');
        const lines = commits.map(c => `${c.hash?.slice(0, 7)} — ${c.message?.split('\n')[0]} [${c.author?.raw}] (${c.date?.slice(0, 10)})`);
        sendText(id, `Commits (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'bitbucket_get_diff': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/diff`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        // diff returns plain text, res may already be a string
        const text = typeof res === 'string' ? res : JSON.stringify(res);
        sendText(id, text.slice(0, 8000) + (text.length > 8000 ? '\n...(truncated)' : ''));
      });
    }

    case 'bitbucket_approve_pr': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/approve`;
      return fetchBitbucket(path, 'POST', {}, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `PR #${args.prId} aprobado.`);
      });
    }

    case 'bitbucket_unapprove_pr': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/approve`;
      return fetchBitbucket(path, 'DELETE', null, (err) => {
        if (err) return sendError(id, err);
        sendText(id, `Aprobación retirada del PR #${args.prId}.`);
      });
    }

    case 'bitbucket_merge_pr': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/merge`;
      const body = {
        type: 'pullrequest',
        merge_strategy: args.mergeStrategy || 'merge_commit',
        ...(args.message ? { message: args.message } : {})
      };
      return fetchBitbucket(path, 'POST', body, (err, pr) => {
        if (err) return sendError(id, err);
        sendText(id, `PR #${args.prId} mergeado. Estado: ${pr.state}`);
      });
    }

    case 'bitbucket_decline_pr': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/decline`;
      return fetchBitbucket(path, 'POST', {}, (err, pr) => {
        if (err) return sendError(id, err);
        sendText(id, `PR #${args.prId} declinado.`);
      });
    }

    case 'bitbucket_get_pr_comments': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pullrequests/${args.prId}/comments?pagelen=50`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const comments = res.values || [];
        if (!comments.length) return sendText(id, 'Sin comentarios.');
        const lines = comments.map(c => `[${c.id}] ${c.author?.display_name} (${c.created_on?.slice(0,10)}):\n  ${(c.content?.raw || '').slice(0, 200)}`);
        sendText(id, `Comentarios del PR #${args.prId} (${lines.length}):\n\n${lines.join('\n\n')}`);
      });
    }

    case 'bitbucket_get_file': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const branch = args.branch ? `?at=${encodeURIComponent(args.branch)}` : '';
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/src/HEAD/${encodeURIComponent(args.path)}${branch}`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const text = typeof res === 'string' ? res : JSON.stringify(res);
        sendText(id, text.slice(0, 10000) + (text.length > 10000 ? '\n...(truncated)' : ''));
      });
    }

    case 'bitbucket_get_pipelines': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const limit = args.limit || 10;
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pipelines/?sort=-created_on&pagelen=${limit}`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const pipelines = res.values || [];
        if (!pipelines.length) return sendText(id, 'Sin pipelines.');
        const lines = pipelines.map(p =>
          `[${p.build_number}] ${p.state?.name}${p.state?.result?.name ? ` / ${p.state.result.name}` : ''} — ${p.created_on?.slice(0, 16)} | rama: ${p.target?.ref_name || '-'}`
        );
        sendText(id, `Pipelines de ${args.repo} (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    case 'bitbucket_get_pipeline': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/repositories/${encodeURIComponent(BITBUCKET_WORKSPACE)}/${encodeURIComponent(args.repo)}/pipelines/${encodeURIComponent(args.pipelineId)}`;
      return fetchBitbucket(path, 'GET', null, (err, p) => {
        if (err) return sendError(id, err);
        const out = [
          `Pipeline #${p.build_number} — ${p.state?.name} / ${p.state?.result?.name || '-'}`,
          `Rama: ${p.target?.ref_name || '-'} | Commit: ${p.target?.commit?.hash?.slice(0,7) || '-'}`,
          `Inicio: ${p.created_on?.slice(0,16)} | Duración: ${p.duration_in_seconds || '-'}s`
        ].join('\n');
        sendText(id, out);
      });
    }

    case 'bitbucket_list_workspace_members': {
      if (!BITBUCKET_WORKSPACE) return sendText(id, 'Falta la variable BITBUCKET_WORKSPACE en .env');
      const path = `/2.0/workspaces/${encodeURIComponent(BITBUCKET_WORKSPACE)}/members?pagelen=50`;
      return fetchBitbucket(path, 'GET', null, (err, res) => {
        if (err) return sendError(id, err);
        const members = res.values || [];
        if (!members.length) return sendText(id, 'Sin miembros.');
        const lines = members.map(m => `${m.user?.display_name} (${m.user?.account_id || '-'})`);
        sendText(id, `Miembros del workspace ${BITBUCKET_WORKSPACE} (${lines.length}):\n\n${lines.join('\n')}`);
      });
    }

    // ── Meta tools ──────────────────────────────────────────────────────────────
    case 'mcp_get_agent_context': {
      const templatePath = require('path').join(__dirname, 'agents', 'agents-template.md');
      try {
        const content = require('fs').readFileSync(templatePath, 'utf8');
        return sendText(id, content);
      } catch (e) {
        return sendError(id, new Error(`Cannot read agents-template.md: ${e.message}`));
      }
    }

    default:
      sendText(id, `Herramienta desconocida: ${name}`);
  }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────
function fetchAtlassian(path, method, body, callback) {
  return fetchApi(ATLASSIAN_HOST, path, method, body, auth, callback);
}

function fetchBitbucket(path, method, body, callback) {
  return fetchApi('api.bitbucket.org', path, method, body, auth, callback);
}

function fetchApi(hostname, path, method, body, authHeader, callback) {
  const bodyStr = body ? JSON.stringify(body) : null;
  const options = {
    hostname,
    path,
    method,
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
    }
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode >= 400) {
        return callback(new Error(`API error ${res.statusCode} (${hostname}): ${data.slice(0, 300)}`));
      }
      if (!data) return callback(null, {});
      // Some endpoints (diff, file content) return plain text — handle gracefully
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('application/json')) return callback(null, data);
      try { callback(null, JSON.parse(data)); } catch (e) { callback(null, data); }
    });
  });
  req.on('error', callback);
  if (bodyStr) req.write(bodyStr);
  req.end();
}

// ── Text utilities ─────────────────────────────────────────────────────────────
function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.content) return node.content.map(extractText).join('');
  return '';
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li>/gi, '  • ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
