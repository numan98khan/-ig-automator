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
}

export type UsageResourceType = keyof TierLimits;

export type WorkspaceMemberRole = 'owner' | 'admin' | 'agent' | 'viewer';

export type TierFeature = 'crm' | 'integrations' | 'flowBuilder';
