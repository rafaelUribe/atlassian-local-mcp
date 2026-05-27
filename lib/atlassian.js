const https = require('https');
const { auth, ATLASSIAN_HOST } = require('./config');

function fetchApi(hostname, apiPath, method, body, authHeader, callback) {
  const bodyStr = body ? JSON.stringify(body) : null;
  const options = {
    hostname, path: apiPath, method, timeout: 30000,
    headers: {
      Authorization: `Basic ${authHeader}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
    },
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 400)
        return callback(new Error(`API error ${res.statusCode} (${hostname}): ${data.slice(0, 300)}`));
      if (!data) return callback(null, {});
      const ct = res.headers['content-type'] || '';
      if (!ct.includes('application/json')) return callback(null, data);
      try { callback(null, JSON.parse(data)); } catch { callback(null, data); }
    });
  });
  req.on('timeout', () => { req.destroy(); callback(new Error(`Request to ${hostname}${apiPath} timed out`)); });
  req.on('error', callback);
  if (bodyStr) req.write(bodyStr);
  req.end();
}

const fetchAtlassian = (p, m, b, cb) => fetchApi(ATLASSIAN_HOST, p, m, b, auth, cb);
const fetchBitbucket = (p, m, b, cb) => fetchApi('api.bitbucket.org', p, m, b, auth, cb);
const atlassianP     = (p, m, b)     => new Promise((res, rej) => fetchAtlassian(p, m, b, (e, d) => e ? rej(e) : res(d)));
const bitbucketP     = (p, m, b)     => new Promise((res, rej) => fetchBitbucket(p, m, b, (e, d) => e ? rej(e) : res(d)));

function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.content) return node.content.map(extractText).join('');
  return '';
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n').replace(/<li>/gi, '  • ').replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { fetchApi, fetchAtlassian, fetchBitbucket, atlassianP, bitbucketP, extractText, stripHtml };
