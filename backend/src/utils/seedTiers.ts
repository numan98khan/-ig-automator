import Tier from '../models/Tier';

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
      messageCategories: 10,
    },
    allowCustomCategories: true,
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
      messageCategories: 50,
    },
    allowCustomCategories: true,
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
      messageCategories: 100,
    },
    allowCustomCategories: true,
  },
];

export const seedBaselineTiers = async () => {
  for (const tierData of DEFAULT_TIERS) {
    const existing = await Tier.findOne({ name: tierData.name });
    if (existing) {
      await Tier.updateOne({ _id: existing._id }, tierData);
      continue;
    }
    await Tier.create(tierData);
  }
};
