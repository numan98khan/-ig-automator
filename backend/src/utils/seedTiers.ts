import { upsertTier } from '../services/tierService';

const DEFAULT_TIERS = [
  {
    name: 'Starter',
    description: 'For small teams getting started',
    isDefault: true,
    limits: {
      aiMessages: 300,
      instagramAccounts: 1,
      teamMembers: 3,
      automations: 5,
      knowledgeItems: 25,
    },
  },
  {
    name: 'Pro',
    description: 'Growing teams with more automation needs',
    limits: {
      aiMessages: 2000,
      instagramAccounts: 3,
      teamMembers: 15,
      automations: 20,
      knowledgeItems: 200,
    },
  },
  {
    name: 'Enterprise',
    description: 'High volume teams with custom limits',
    limits: {
      aiMessages: undefined,
      instagramAccounts: 10,
      teamMembers: 100,
      automations: 100,
      knowledgeItems: 1000,
    },
  },
];

export const seedBaselineTiers = async () => {
  for (const tierData of DEFAULT_TIERS) {
    await upsertTier(tierData);
  }
};
