export type TierStatus = 'active' | 'inactive' | 'deprecated';

export interface TierLimits {
  aiMessages?: number;
  instagramAccounts?: number;
  teamMembers?: number;
  automations?: number;
  knowledgeItems?: number;
  crm?: boolean;
  integrations?: boolean;
  flowBuilder?: boolean;
  executionTimeline?: boolean;
}

export type UsageResourceType =
  | 'aiMessages'
  | 'instagramAccounts'
  | 'teamMembers'
  | 'automations'
  | 'knowledgeItems';

export type WorkspaceMemberRole = 'owner' | 'admin' | 'agent' | 'viewer';

export type TierFeature = 'crm' | 'integrations' | 'flowBuilder' | 'executionTimeline';
