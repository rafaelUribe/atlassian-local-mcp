import { writable } from 'svelte/store';

export const configured = writable(false);
export const serverConnected = writable(false);
export const workspaceRepos = writable<{ slug: string; name: string }[]>([]);
