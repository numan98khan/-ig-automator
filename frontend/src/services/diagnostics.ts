export interface Breadcrumb {
  type: string;
  label: string;
  meta?: Record<string, any>;
  at: string;
}

const breadcrumbs: Breadcrumb[] = [];
const requestIds: string[] = [];

const MAX_BREADCRUMBS = 50;
const MAX_REQUEST_IDS = 20;

export function recordBreadcrumb(entry: Omit<Breadcrumb, 'at'> & { at?: string }) {
  const item: Breadcrumb = {
    ...entry,
    at: entry.at || new Date().toISOString(),
  };

  breadcrumbs.push(item);
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }
}

export function getBreadcrumbs(): Breadcrumb[] {
  return [...breadcrumbs];
}

export function recordRequestId(id: string) {
  requestIds.push(id);
  if (requestIds.length > MAX_REQUEST_IDS) {
    requestIds.splice(0, requestIds.length - MAX_REQUEST_IDS);
  }
}

export function getRecentRequestIds(): string[] {
  return [...requestIds];
}

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `req_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}
