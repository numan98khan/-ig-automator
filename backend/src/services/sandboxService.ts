import mongoose from 'mongoose';
import SandboxScenario from '../models/SandboxScenario';
import SandboxRun, { SandboxRunStep } from '../models/SandboxRun';
import MessageCategory from '../models/MessageCategory';
import { categorizeMessage } from './aiCategorization';
import { generateAIReply } from './aiReplyService';
import { getWorkspaceSettings, getGoalConfigs, detectGoalIntent, goalMatchesWorkspace } from './automationService';
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
    primaryGoal: settings?.primaryGoal,
    secondaryGoal: settings?.secondaryGoal,
    goalConfigs: settings?.goalConfigs,
    humanEscalationBehavior: settings?.humanEscalationBehavior,
    humanHoldMinutes: settings?.humanHoldMinutes,
    escalationGuidelines: settings?.escalationGuidelines,
    escalationExamples: settings?.escalationExamples,
  };
}

export async function runSandboxScenario(
  workspaceId: string,
  scenarioId: string
): Promise<RunResult> {
  const scenario = await SandboxScenario.findOne({ _id: scenarioId, workspaceId });
  if (!scenario) {
    throw new Error('Scenario not found');
  }

  const settings = await getWorkspaceSettings(workspaceId);
  const goalConfigs = getGoalConfigs(settings);
  const conversation = buildSandboxConversation(workspaceId);
  const history: Pick<IMessage, 'from' | 'text' | 'attachments' | 'createdAt'>[] = [];
  const steps: SandboxRunStep[] = [];

  for (const step of scenario.messages) {
    if (step.role !== 'customer') continue;

    const categorization = await categorizeMessage(step.text, workspaceId);
    const category = await MessageCategory.findOne({ workspaceId, nameEn: categorization.categoryName });
    const detectedGoal = detectGoalIntent(step.text || '');
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
      latestCustomerMessage: step.text,
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
    });

    steps.push({
      customerText: step.text,
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

    history.push({ from: 'customer', text: step.text, createdAt: new Date() });
    history.push({ from: 'ai', text: aiReply.replyText, createdAt: new Date() });
  }

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
