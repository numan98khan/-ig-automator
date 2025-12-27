import mongoose from 'mongoose';
import SandboxScenario from '../models/SandboxScenario';
import SandboxRun, { SandboxRunStep } from '../models/SandboxRun';
import MessageCategory from '../models/MessageCategory';
import { categorizeMessage } from './aiCategorization';
import { generateAIReply } from './aiReplyService';
import { pauseForTypingIfNeeded } from './automation/typing';
import {
  getWorkspaceSettings,
  getGoalConfigs,
  detectGoalIntent,
  goalMatchesWorkspace,
} from './workspaceSettingsService';
import { GoalType } from '../types/automationGoals';
import { IMessage } from '../models/Message';

interface RunResult {
  runId: string;
  steps: SandboxRunStep[];
  createdAt: Date;
  settingsSnapshot?: Record<string, any>;
}

function buildSandboxConversation(workspaceId: string) {
  return {
    _id: new mongoose.Types.ObjectId(),
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    participantName: 'Sandbox User',
    participantHandle: 'sandbox',
    instagramAccountId: new mongoose.Types.ObjectId(),
    lastMessageAt: new Date(),
    platform: 'mock',
  } as any;
}

function recordSettingsSnapshot(settings: any) {
  return {
    decisionMode: settings?.decisionMode,
    defaultLanguage: settings?.defaultLanguage,
    defaultReplyLanguage: settings?.defaultReplyLanguage,
    uiLanguage: settings?.uiLanguage,
    allowHashtags: settings?.allowHashtags,
    allowEmojis: settings?.allowEmojis,
    maxReplySentences: settings?.maxReplySentences,
    skipTypingPauseInSandbox: settings?.skipTypingPauseInSandbox,
    primaryGoal: settings?.primaryGoal,
    secondaryGoal: settings?.secondaryGoal,
    goalConfigs: settings?.goalConfigs,
    humanEscalationBehavior: settings?.humanEscalationBehavior,
    humanHoldMinutes: settings?.humanHoldMinutes,
    escalationGuidelines: settings?.escalationGuidelines,
    escalationExamples: settings?.escalationExamples,
  };
}

async function simulateMessages(
  workspaceId: string,
  messages: string[],
  settings: Record<string, any>
): Promise<SandboxRunStep[]> {
  const goalConfigs = getGoalConfigs(settings);
  const conversation = buildSandboxConversation(workspaceId);
  const history: Pick<IMessage, 'from' | 'text' | 'attachments' | 'createdAt'>[] = [];
  const steps: SandboxRunStep[] = [];

  for (const messageText of messages) {
    await pauseForTypingIfNeeded('mock', settings);

    const categorization = await categorizeMessage(messageText, workspaceId);
    const category = await MessageCategory.findOne({ workspaceId, nameEn: categorization.categoryName });
    const detectedGoal = detectGoalIntent(messageText || '');
    const goalMatched = goalMatchesWorkspace(
      detectedGoal,
      settings.primaryGoal as GoalType | undefined,
      settings.secondaryGoal as GoalType | undefined,
    )
      ? detectedGoal
      : 'none';

    const aiReply = await generateAIReply({
      conversation,
      workspaceId,
      latestCustomerMessage: messageText,
      categoryId: category?._id,
      categorization,
      historyLimit: 20,
      goalContext: {
        workspaceGoals: {
          primaryGoal: settings.primaryGoal,
          secondaryGoal: settings.secondaryGoal,
          configs: goalConfigs,
        },
        detectedGoal: goalMatched !== 'none' ? goalMatched : 'none',
        activeGoalType: goalMatched !== 'none' ? goalMatched : undefined,
        goalState: 'collecting',
        collectedFields: {},
      },
      messageHistory: history,
      mode: 'sandbox',
      workspaceSettingsOverride: settings,
    });

    steps.push({
      customerText: messageText,
      aiReplyText: aiReply.replyText,
      meta: {
        detectedLanguage: categorization.detectedLanguage,
        categoryName: categorization.categoryName,
        goalMatched,
        shouldEscalate: aiReply.shouldEscalate,
        escalationReason: aiReply.escalationReason,
        tags: aiReply.tags,
        knowledgeItemsUsed: aiReply.knowledgeItemsUsed,
      },
    });

    history.push({ from: 'customer', text: messageText, createdAt: new Date() });
    history.push({ from: 'ai', text: aiReply.replyText, createdAt: new Date() });
  }

  return steps;
}

export async function runSandboxScenario(
  workspaceId: string,
  scenarioId: string,
  overrideSettings?: Record<string, any>
): Promise<RunResult> {
  const scenario = await SandboxScenario.findOne({ _id: scenarioId, workspaceId });
  if (!scenario) {
    throw new Error('Scenario not found');
  }

  const settings = { ...(await getWorkspaceSettings(workspaceId)), ...(overrideSettings || {}) };

  const steps = await simulateMessages(
    workspaceId,
    scenario.messages.filter((step) => step.role === 'customer').map((step) => step.text),
    settings,
  );

  const run = await SandboxRun.create({
    workspaceId,
    scenarioId: scenario._id,
    settingsSnapshot: recordSettingsSnapshot(settings),
    steps,
  });

  return {
    runId: run._id.toString(),
    steps: run.steps,
    createdAt: run.createdAt,
    settingsSnapshot: run.settingsSnapshot,
  };
}

export async function runQuickSandbox(
  workspaceId: string,
  messages: string[],
  overrideSettings?: Record<string, any>
): Promise<RunResult> {
  const settings = { ...(await getWorkspaceSettings(workspaceId)), ...(overrideSettings || {}) };

  const steps = await simulateMessages(workspaceId, messages, settings);

  return {
    runId: new mongoose.Types.ObjectId().toString(),
    steps,
    createdAt: new Date(),
    settingsSnapshot: recordSettingsSnapshot(settings),
  };
}
