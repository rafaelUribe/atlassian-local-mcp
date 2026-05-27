export interface Tool {
  name: string;
  description: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface JiraContext {
  summary: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  reporter: string;
  labels: string[];
  components: string[];
  issueType: string;
  epic: string;
  created: string;
  updated: string;
  commentsCount: number;
}

export interface TicketContext {
  ticketId: string;
  indexedAt: string;
  jira: JiraContext;
}

export interface RepoBranch {
  name: string;
  target?: { date?: string; hash?: string };
}

export interface RepoPR {
  id: number;
  title: string;
  state: string;
}

export interface RepoEntry {
  repo: string;
  branches: RepoBranch[];
  prs: RepoPR[];
}

export interface ArticleEntry {
  id: string;
  title: string;
  space: string;
  url: string;
  lastModified: string;
  version: number;
}

export interface RelatedTicket {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string;
}

export interface TimelineEntry {
  date: string;
  type: string;
  summary: string;
}

export interface ContextLink {
  id: string;
  url: string;
  title?: string;
  type: 'confluence' | 'jira' | 'bitbucket' | 'other';
  addedAt: string;
}

export interface CachedTicketSummary {
  id: string;
  context: TicketContext | null;
  repos: RepoEntry[];
  articles: ArticleEntry[];
  related: RelatedTicket[];
  timeline: TimelineEntry[];
  pinned: string[];
  links: ContextLink[];
}
