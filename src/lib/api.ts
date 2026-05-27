export const BASE = import.meta.env.DEV ? 'http://localhost:3847' : window.location.origin;

// ── JSON-RPC ──────────────────────────────────────────────────────────────────
export async function rpcCall<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

export async function toolCall<T = { content: { text: string }[] }>(
  name: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const result = await rpcCall<{ isError?: boolean; content: { type: string; text: string }[] }>('tools/call', { name, arguments: args });
  if (result.isError) throw new Error(result.content?.[0]?.text || `Tool ${name} failed`);
  return result as unknown as T;
}

export async function getMyJiraTickets(): Promise<{ key: string; summary: string; status: string }[]> {
  const res = await fetch(`${BASE}/api/jira/my-tickets`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.issues ?? [];
}

// ── REST helpers ──────────────────────────────────────────────────────────────
export async function getConfig(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/api/config`);
  return res.json();
}

export async function saveConfig(data: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getHealth(): Promise<{ status: string; tools: number; uptime: number }> {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

export async function getCachedTickets(): Promise<import('./types').CachedTicketSummary[]> {
  const res = await fetch(`${BASE}/api/cache/tickets`);
  return res.json();
}

export async function getBitbucketRepos(): Promise<{ slug: string; name: string }[]> {
  const res = await fetch(`${BASE}/api/bitbucket/repos`);
  return res.json();
}

export async function pinRepos(ticketId: string, pinnedRepos: string[]): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/cache/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, pinnedRepos }),
  });
  return res.json();
}

export async function addContextLink(
  ticketId: string,
  link: { url: string; title?: string; type: string }
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/cache/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, link }),
  });
  return res.json();
}

export async function removeContextLink(ticketId: string, linkId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/cache/link/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, linkId }),
  });
  return res.json();
}

export async function removeTicketFromCache(ticketId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/api/cache/ticket/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId }),
  });
  return res.json();
}
