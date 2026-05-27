#!/usr/bin/env node
/**
 * confluence-doc.js — Skill de Documentación Limpia en Confluence
 *
 * Automatiza el flujo: buscar → leer 2 mejores → proponer → (confirmar) → crear.
 * Evita duplicados y ahorra tokens al condensar 3 llamadas MCP en un solo paso.
 *
 * Uso:
 *   node confluence-doc.js --topic "<tema>" --space "<KEY>" [--parentId <id>]
 *   node confluence-doc.js --topic "Earnbacks API" --space "ENG"
 */

const http = require('http');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

// ── Config ─────────────────────────────────────────────────────────────────────
function getMcpUrl() {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(__dirname, 'mcp.info'), 'utf8'));
    return info.url || 'http://localhost:3847/';
  } catch {
    return 'http://localhost:3847/';
  }
}

const MCP_URL = getMcpUrl();

// ── CLI args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const topic    = getArg('--topic');
const spaceKey = getArg('--space');
const parentId = getArg('--parentId');

if (!topic || !spaceKey) {
  console.error('Uso: node confluence-doc.js --topic "<tema>" --space "<KEY>" [--parentId <id>]');
  process.exit(1);
}

// ── MCP caller ─────────────────────────────────────────────────────────────────
let _mcpId = 1;
function callMcp(toolName, toolArgs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: _mcpId++,
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs }
    });
    const url = new URL(MCP_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname || '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve(parsed.result?.content?.[0]?.text || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Main flow ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍 [1/3] Buscando páginas relacionadas con "${topic}" en espacio ${spaceKey}...\n`);

  // Step 1: Search
  const cql = `text ~ "${topic}" AND type = page AND space = "${spaceKey}" ORDER BY lastmodified DESC`;
  const searchResult = await callMcp('confluence_search', { cql, maxResults: 5 });

  // Parse page IDs from search result text (format: [ID] Title ...)
  const idMatches = [...searchResult.matchAll(/\[(\d+)\]/g)].map(m => m[1]);

  if (!idMatches.length) {
    console.log('No se encontraron páginas relacionadas. No hay riesgo de duplicado.\n');
  } else {
    console.log('Páginas encontradas:\n' + searchResult + '\n');
  }

  // Step 2: Read top 2 to inspect structure
  const top2 = idMatches.slice(0, 2);
  const readPages = [];
  if (top2.length) {
    console.log(`📖 [2/3] Leyendo estructura de las ${top2.length} página(s) más relevantes...\n`);
    for (const pageId of top2) {
      const content = await callMcp('confluence_get_page', { pageId });
      readPages.push(content);
      // Print a brief summary (first 300 chars)
      console.log(`  ── Página [${pageId}] ──`);
      console.log(content.slice(0, 300) + (content.length > 300 ? '\n  ...(truncado)' : '') + '\n');
    }
  }

  // Step 3: Build suggested structure from existing patterns
  const suggestedStructure = buildSuggestedStructure(topic, readPages);

  // Step 4: Present proposal to user
  console.log('═'.repeat(70));
  console.log('📋 [3/3] PROPUESTA DE NUEVA PÁGINA\n');
  console.log(`  Espacio:     ${spaceKey}`);
  if (parentId) console.log(`  Página padre: ${parentId}`);
  console.log(`  Título:      ${topic}`);
  console.log(`\n  Estructura propuesta:\n${suggestedStructure}`);

  if (idMatches.length) {
    console.log(`\n  ⚠️  POSIBLES DUPLICADOS (${idMatches.length} resultado(s) relacionados):`);
    idMatches.forEach(id => console.log(`    • Page ID ${id} — verifica antes de continuar.`));
  } else {
    console.log('\n  ✅ Sin duplicados detectados.');
  }

  console.log('\n' + '═'.repeat(70));

  // Step 5: Ask for explicit confirmation
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('\n¿Confirmas la creación de esta página? (s/n): ', async (answer) => {
    rl.close();
    if (answer.trim().toLowerCase() !== 's') {
      console.log('\nOperación cancelada. No se creó ninguna página.');
      process.exit(0);
    }

    // Step 6: Create page
    console.log('\n🚀 Creando página en Confluence...\n');
    const htmlContent = structureToHtml(topic, readPages);
    const result = await callMcp('confluence_create_page', {
      spaceKey,
      title: topic,
      content: htmlContent,
      ...(parentId ? { parentId } : {})
    });
    console.log('✅ Página creada:\n' + result);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildSuggestedStructure(title, existingPages) {
  // Try to infer common headers from existing pages
  const headers = new Set();
  existingPages.forEach(page => {
    const matches = page.match(/^#+\s+.+/gm) || [];
    matches.forEach(h => headers.add(h.trim()));
  });

  const common = [...headers].slice(0, 6);
  const defaultHeaders = ['## Resumen', '## Contexto', '## Diseño / Decisiones', '## Endpoints / Interfaz', '## Ejemplos', '## Referencias'];
  const finalHeaders = common.length >= 3 ? common : defaultHeaders;

  return `  # ${title}\n` + finalHeaders.map(h => `  ${h}`).join('\n');
}

function structureToHtml(title, existingPages) {
  const headers = new Set();
  existingPages.forEach(page => {
    (page.match(/^#+\s+.+/gm) || []).forEach(h => headers.add(h.trim()));
  });

  const defaultSections = ['Resumen', 'Contexto', 'Diseño / Decisiones', 'Endpoints / Interfaz', 'Ejemplos', 'Referencias'];
  const sections = [...headers].slice(0, 6).map(h => h.replace(/^#+\s+/, ''));
  const finalSections = sections.length >= 3 ? sections : defaultSections;

  return finalSections.map(s => `<h2>${s}</h2><p></p>`).join('\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
