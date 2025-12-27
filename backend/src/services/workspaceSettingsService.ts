import mongoose from 'mongoose';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { GoalConfigurations, GoalType } from '../types/automationGoals';

const DEFAULT_GOAL_CONFIGS: GoalConfigurations = {
  leadCapture: {
    collectName: true,
    collectPhone: true,
    collectEmail: false,
    collectCustomNote: false,
  },
  booking: {
    bookingLink: '',
    collectDate: true,
    collectTime: true,
    collectServiceType: false,
  },
  order: {
    catalogUrl: '',
    collectProductName: true,
    collectQuantity: true,
    collectVariant: false,
  },
  support: {
    askForOrderId: true,
    askForPhoto: false,
  },
  drive: {
    targetType: 'website',
    targetLink: '',
  },
};

export function getGoalConfigs(settings: any): GoalConfigurations {
  return {
    leadCapture: { ...DEFAULT_GOAL_CONFIGS.leadCapture, ...(settings?.goalConfigs?.leadCapture || {}) },
    booking: { ...DEFAULT_GOAL_CONFIGS.booking, ...(settings?.goalConfigs?.booking || {}) },
    order: { ...DEFAULT_GOAL_CONFIGS.order, ...(settings?.goalConfigs?.order || {}) },
    support: { ...DEFAULT_GOAL_CONFIGS.support, ...(settings?.goalConfigs?.support || {}) },
    drive: { ...DEFAULT_GOAL_CONFIGS.drive, ...(settings?.goalConfigs?.drive || {}) },
  };
}

export function detectGoalIntent(text: string): GoalType {
  const lower = text.toLowerCase();

  if (/(book|appointment|schedule|reserve|reservation)/.test(lower)) return 'book_appointment';
  if (/(buy|price|order|purchase|checkout|cart|start order|place order)/.test(lower)) return 'start_order';
  if (/(interested|contact me|reach out|quote|more info|call me|email me)/.test(lower)) return 'capture_lead';
  if (/(late|broken|refund|problem|issue|support|help with order|cancel)/.test(lower)) return 'handle_support';
  if (/(where are you|location|address|website|site|link|whatsapp|app|store)/.test(lower)) return 'drive_to_channel';
  return 'none';
}

export function goalMatchesWorkspace(goal: GoalType, primary?: GoalType, secondary?: GoalType): boolean {
  if (!goal || goal === 'none') return false;
  return goal === primary || goal === secondary;
}

export async function getWorkspaceSettings(
  workspaceId: mongoose.Types.ObjectId | string,
): Promise<any> {
  let settings = await WorkspaceSettings.findOne({ workspaceId });

  if (!settings) {
    settings = await WorkspaceSettings.create({ workspaceId });
  }

  return settings;
}
