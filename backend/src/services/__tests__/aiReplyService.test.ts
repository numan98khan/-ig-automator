import mongoose from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createResponseMock: vi.fn(),
  knowledgeFindMock: vi.fn(),
  workspaceSettingsFindOneMock: vi.fn(),
  searchWorkspaceKnowledgeMock: vi.fn(),
  logOpenAiUsageMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    responses = { create: mocks.createResponseMock };
  },
}));

vi.mock('../../models/KnowledgeItem', () => ({
  default: { find: mocks.knowledgeFindMock },
}));

vi.mock('../../models/WorkspaceSettings', () => ({
  __esModule: true,
  default: { findOne: mocks.workspaceSettingsFindOneMock },
}));

vi.mock('../../models/Message', () => ({
  __esModule: true,
  default: { find: vi.fn() },
}));

vi.mock('../vectorStore', () => ({
  searchWorkspaceKnowledge: mocks.searchWorkspaceKnowledgeMock,
}));

vi.mock('../adminLogSettingsService', () => ({
  getLogSettingsSnapshot: () => ({
    aiTimingEnabled: false,
    automationLogsEnabled: false,
    openaiApiLogsEnabled: false,
  }),
}));

vi.mock('../openAiUsageService', () => ({
  logOpenAiUsage: mocks.logOpenAiUsageMock,
}));

import { generateAIReply } from '../aiReplyService';

const buildResponse = (payload: Record<string, unknown>) => ({
  id: 'resp_1',
  model: 'gpt-4o-mini',
  usage: { input_tokens: 10, output_tokens: 20 },
  output_text: JSON.stringify(payload),
  output: [],
});

const baseConversation = {
  _id: new mongoose.Types.ObjectId(),
};

const baseMessageHistory = [
  { from: 'customer', text: 'Tell me about shipping.', attachments: [], createdAt: new Date() },
];

const baseWorkspaceSettings = {
  allowHashtags: true,
  allowEmojis: true,
  maxReplySentences: 3,
  defaultReplyLanguage: 'en',
  decisionMode: 'assist',
};

describe('generateAIReply', () => {
  beforeEach(() => {
    mocks.createResponseMock.mockReset();
    mocks.knowledgeFindMock.mockReset();
    mocks.workspaceSettingsFindOneMock.mockReset();
    mocks.searchWorkspaceKnowledgeMock.mockReset();
    mocks.logOpenAiUsageMock.mockReset();
  });

  it('builds knowledge context with RAG matches when enabled', async () => {
    const knowledgeItems = [
      {
        _id: new mongoose.Types.ObjectId('650000000000000000000001'),
        title: 'Shipping Policy',
        content: 'We ship in 2 business days.',
      },
    ];

    mocks.knowledgeFindMock.mockResolvedValue(knowledgeItems);
    mocks.searchWorkspaceKnowledgeMock.mockResolvedValue([
      {
        id: 'rag-1',
        title: 'Express Shipping',
        content: 'Express shipping available in select regions.',
      },
    ]);

    mocks.createResponseMock.mockResolvedValueOnce(
      buildResponse({
        replyText: 'We ship fast.',
        shouldEscalate: false,
        escalationReason: null,
        tags: ['shipping'],
        goalProgress: null,
      }),
    );

    const result = await generateAIReply({
      conversation: baseConversation as any,
      workspaceId: 'workspace-1',
      latestCustomerMessage: 'Tell me about shipping.',
      messageHistory: baseMessageHistory as any,
      workspaceSettingsOverride: baseWorkspaceSettings as any,
      ragEnabled: true,
    });

    expect(mocks.searchWorkspaceKnowledgeMock).toHaveBeenCalledWith('workspace-1', 'Tell me about shipping.', 5);
    expect(mocks.createResponseMock).toHaveBeenCalledTimes(1);

    const requestPayload = mocks.createResponseMock.mock.calls[0][0];
    const userMessage = requestPayload.input[1].content[0].text as string;

    expect(userMessage).toContain('General Knowledge Base:');
    expect(userMessage).toContain('Shipping Policy: We ship in 2 business days.');
    expect(userMessage).toContain('Vector RAG Matches:');
    expect(userMessage).toContain('Express Shipping: Express shipping available in select regions.');

    expect(result.knowledgeItemsUsed?.[0]).toEqual({
      id: 'rag-1',
      title: 'Express Shipping (RAG)',
    });
  });

  it('skips vector RAG when disabled', async () => {
    mocks.knowledgeFindMock.mockResolvedValue([
      {
        _id: new mongoose.Types.ObjectId('650000000000000000000002'),
        title: 'Returns',
        content: 'Returns accepted within 30 days.',
      },
    ]);

    mocks.createResponseMock.mockResolvedValueOnce(
      buildResponse({
        replyText: 'Returns are accepted.',
        shouldEscalate: false,
        escalationReason: null,
        tags: ['returns'],
        goalProgress: null,
      }),
    );

    await generateAIReply({
      conversation: baseConversation as any,
      workspaceId: 'workspace-2',
      latestCustomerMessage: 'How do returns work?',
      messageHistory: baseMessageHistory as any,
      workspaceSettingsOverride: baseWorkspaceSettings as any,
      ragEnabled: false,
    });

    expect(mocks.searchWorkspaceKnowledgeMock).not.toHaveBeenCalled();
    const requestPayload = mocks.createResponseMock.mock.calls[0][0];
    const userMessage = requestPayload.input[1].content[0].text as string;
    expect(userMessage).not.toContain('Vector RAG Matches:');
  });

  it('adds escalation tag when model escalates', async () => {
    mocks.knowledgeFindMock.mockResolvedValue([]);
    mocks.createResponseMock.mockResolvedValueOnce(
      buildResponse({
        replyText: 'A specialist will help.',
        shouldEscalate: true,
        escalationReason: 'Sensitive request',
        tags: ['urgent'],
        goalProgress: null,
      }),
    );

    const result = await generateAIReply({
      conversation: baseConversation as any,
      workspaceId: 'workspace-3',
      latestCustomerMessage: 'I need a refund now.',
      messageHistory: baseMessageHistory as any,
      workspaceSettingsOverride: baseWorkspaceSettings as any,
    });

    expect(result.shouldEscalate).toBe(true);
    expect(result.tags).toEqual(expect.arrayContaining(['urgent', 'escalation']));
  });

  it('falls back to escalation response when OpenAI fails', async () => {
    mocks.knowledgeFindMock.mockResolvedValue([]);
    mocks.createResponseMock.mockRejectedValueOnce(new Error('timeout'));

    const result = await generateAIReply({
      conversation: baseConversation as any,
      workspaceId: 'workspace-4',
      latestCustomerMessage: 'Help me.',
      messageHistory: baseMessageHistory as any,
      workspaceSettingsOverride: baseWorkspaceSettings as any,
    });

    expect(result.shouldEscalate).toBe(true);
    expect(result.escalationReason).toContain('AI reply generation failed');
    expect(result.tags).toEqual(expect.arrayContaining(['ai_error', 'escalation']));
  });

  it('post-processes replies and preserves structured goal output', async () => {
    mocks.knowledgeFindMock.mockResolvedValue([]);
    mocks.createResponseMock.mockResolvedValueOnce(
      buildResponse({
        replyText: 'Great news 😀! Second sentence #tag.',
        shouldEscalate: false,
        escalationReason: null,
        tags: ['lead'],
        goalProgress: {
          goalType: 'capture_lead',
          status: 'collecting',
          collectedFields: {
            name: 'Sam',
          },
          summary: 'Collecting lead info',
          nextStep: 'Ask for phone',
          shouldCreateRecord: false,
          targetLink: null,
        },
      }),
    );

    const result = await generateAIReply({
      conversation: baseConversation as any,
      workspaceId: 'workspace-5',
      latestCustomerMessage: 'I want to book.',
      messageHistory: baseMessageHistory as any,
      workspaceSettingsOverride: {
        ...baseWorkspaceSettings,
        allowHashtags: false,
        allowEmojis: false,
        maxReplySentences: 1,
      } as any,
    });

    expect(result.replyText).toBe('Great news !');
    expect(result.replyText).not.toMatch(/[#😀]/);
    expect(result.shouldEscalate).toBe(false);
    expect(result.tags).toEqual(['lead']);
    expect(result.goalProgress).toEqual({
      goalType: 'capture_lead',
      status: 'collecting',
      collectedFields: {
        name: 'Sam',
        phone: null,
        email: null,
        customNote: null,
        date: null,
        time: null,
        serviceType: null,
        productName: null,
        quantity: null,
        variant: null,
        orderId: null,
        photoUrl: null,
        targetChannel: null,
      },
      summary: 'Collecting lead info',
      nextStep: 'Ask for phone',
      shouldCreateRecord: false,
      targetLink: null,
    });
  });
});
