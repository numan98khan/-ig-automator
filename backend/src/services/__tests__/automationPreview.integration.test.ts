import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import AutomationInstance from '../../models/AutomationInstance';
import AutomationSession from '../../models/AutomationSession';
import Conversation from '../../models/Conversation';
import FlowTemplate from '../../models/FlowTemplate';
import FlowTemplateVersion from '../../models/FlowTemplateVersion';
import InstagramAccount from '../../models/InstagramAccount';
import Message from '../../models/Message';
import WorkspaceSettings from '../../models/WorkspaceSettings';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.OPENAI_INTENT_MODEL = process.env.OPENAI_INTENT_MODEL || 'gpt-4o-mini';

const automationInstanceRoutes = require('../../routes/automation-instances').default;
const { generateToken } = require('../../utils/jwt');
const { ensureCoreSchema } = require('../../db/coreSchema');
const { closePostgresPool, postgresQuery } = require('../../db/postgres');
const { createUser } = require('../../repositories/core/userRepository');
const { createWorkspace } = require('../../repositories/core/workspaceRepository');
const { createWorkspaceMember } = require('../../repositories/core/workspaceMemberRepository');

const runLiveAiTests = process.env.RUN_LIVE_AI_TESTS === 'true';
const mongoUri = process.env.MONGODB_URI;
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const missingEnvReason = !runLiveAiTests
  ? 'RUN_LIVE_AI_TESTS not enabled'
  : !mongoUri
    ? 'MONGODB_URI not set'
    : !postgresUrl
      ? 'POSTGRES_URL/DATABASE_URL not set'
      : !process.env.OPENAI_API_KEY
        ? 'OPENAI_API_KEY not set'
        : null;
const shouldSkip = Boolean(missingEnvReason);

const maxReplySentences = 2;
const splitIntoSentences = (text: string) =>
  text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];

let server: http.Server | null = null;
let baseUrl = '';
let authToken = '';
let workspaceId = '';
let workspaceObjectId: mongoose.Types.ObjectId | null = null;
let instanceId = '';
let templateId = '';
let templateVersionId = '';
let userId = '';

const requestJson = async (path: string, options?: RequestInit) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(options?.headers || {}),
    },
  });
  const body = await response.json();
  assert.ok(response.ok, `Request failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
};

const startPreviewSession = async (persona?: { name: string; handle?: string }) => {
  const session = await requestJson(`/${instanceId}/preview-session`, {
    method: 'POST',
    body: JSON.stringify({ reset: true, persona }),
  });
  return session as { sessionId: string; conversationId: string };
};

const updatePersona = async (sessionId: string, persona: { name: string; handle?: string }) =>
  requestJson(`/${instanceId}/preview-session/persona`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, persona }),
  });

const fetchStatus = async (sessionId: string) =>
  requestJson(`/${instanceId}/preview-session/status?sessionId=${encodeURIComponent(sessionId)}`);

const sendPreviewMessage = async (sessionId: string, text: string) =>
  requestJson(`/${instanceId}/preview-session/message`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, text }),
  });

before(async () => {
  if (shouldSkip) return;
  await ensureCoreSchema();

  await mongoose.connect(mongoUri!);

  const app = express();
  app.use(express.json());
  app.use('/api/automation-instances', automationInstanceRoutes);

  server = app.listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api/automation-instances`;

  const user = await createUser({
    email: `preview-tester-${Date.now()}@example.com`,
    role: 'user',
    isProvisional: false,
    emailVerified: true,
  });
  userId = user._id;

  const workspace = await createWorkspace({
    name: 'Preview Test Workspace',
    userId: user._id,
    billingAccountId: null,
  });
  workspaceId = workspace._id;
  workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);

  await createWorkspaceMember({
    workspaceId: workspace._id,
    userId: user._id,
    role: 'owner',
  });

  authToken = generateToken(user._id);

  const template = await FlowTemplate.create({
    name: 'Preview Test Template',
    description: 'Automation preview integration test',
    status: 'active',
  });
  templateId = template._id.toString();

  const compiled = {
    graph: {
      response: {
        id: 'ai-reply-node',
        type: 'ai_reply',
        aiSettings: {
          maxReplySentences,
          model: process.env.OPENAI_TEST_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
        },
      },
    },
  };

  const version = await FlowTemplateVersion.create({
    templateId: template._id,
    version: 1,
    status: 'published',
    compiled,
    dslSnapshot: compiled,
    triggers: [
      {
        type: 'dm_message',
        config: { triggerMode: 'any' },
      },
    ],
    publishedAt: new Date(),
  });
  templateVersionId = version._id.toString();

  await FlowTemplate.findByIdAndUpdate(template._id, { currentVersionId: version._id });

  const instance = await AutomationInstance.create({
    name: 'Preview Test Instance',
    workspaceId: workspaceObjectId,
    templateId: template._id,
    templateVersionId: version._id,
    isActive: true,
  });
  instanceId = instance._id.toString();

  await InstagramAccount.create({
    username: 'preview_test_account',
    workspaceId: workspaceObjectId,
    status: 'connected',
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve));
  }

  if (workspaceObjectId) {
    await Promise.all([
      AutomationSession.deleteMany({ automationInstanceId: instanceId }),
      Conversation.deleteMany({ workspaceId: workspaceObjectId }),
      Message.deleteMany({ workspaceId: workspaceObjectId }),
      AutomationInstance.deleteMany({ _id: instanceId }),
      FlowTemplateVersion.deleteMany({ _id: templateVersionId }),
      FlowTemplate.deleteMany({ _id: templateId }),
      InstagramAccount.deleteMany({ workspaceId: workspaceObjectId }),
      WorkspaceSettings.deleteMany({ workspaceId: workspaceObjectId }),
    ]);
  }

  if (workspaceId) {
    await postgresQuery('DELETE FROM core.workspace_members WHERE workspace_id = $1', [workspaceId]);
    await postgresQuery('DELETE FROM core.workspaces WHERE id = $1', [workspaceId]);
  }

  if (userId) {
    await postgresQuery('DELETE FROM core.users WHERE id = $1', [userId]);
  }

  await closePostgresPool();
  await mongoose.disconnect();
});

test('preview session replies within configured sentence limits', { skip: missingEnvReason ?? undefined }, async () => {
  const { sessionId } = await startPreviewSession({ name: 'Preview Customer' });
  await updatePersona(sessionId, { name: 'Preview Customer', handle: '@previewer' });

  const status = await fetchStatus(sessionId);
  assert.equal(status?.persona?.name, 'Preview Customer');

  const response = await sendPreviewMessage(sessionId, 'Hi! Can you share your store hours and location?');
  const aiMessage = response.messages?.find((message: { from: string }) => message.from === 'ai');
  assert.ok(aiMessage?.text?.trim().length > 0, 'Expected a non-empty AI reply');

  const sentenceCount = splitIntoSentences(aiMessage.text).length;
  assert.ok(
    sentenceCount <= maxReplySentences,
    `Expected <= ${maxReplySentences} sentences, got ${sentenceCount}`,
  );
});

test('preview session escalates high-risk prompts with escalation tags', { skip: missingEnvReason ?? undefined }, async () => {
  const { sessionId, conversationId } = await startPreviewSession({ name: 'Escalation Tester' });
  await updatePersona(sessionId, { name: 'Escalation Tester', handle: '@escalation' });

  const response = await sendPreviewMessage(
    sessionId,
    'Your product injured me and I am contacting a lawyer for damages. I need an immediate refund.',
  );
  const aiMessage = response.messages?.find((message: { from: string }) => message.from === 'ai');
  assert.ok(aiMessage?.text?.trim().length > 0, 'Expected a non-empty AI reply');

  const sentenceCount = splitIntoSentences(aiMessage.text).length;
  assert.ok(
    sentenceCount <= maxReplySentences,
    `Expected <= ${maxReplySentences} sentences, got ${sentenceCount}`,
  );

  const storedMessage = await Message.findOne({ conversationId, from: 'ai' }).sort({ createdAt: -1 }).lean();
  assert.equal(storedMessage?.aiShouldEscalate, true, 'Expected escalation for high-risk prompt');
  assert.ok(
    storedMessage?.aiTags?.includes('escalation'),
    `Expected escalation tag, got ${JSON.stringify(storedMessage?.aiTags || [])}`,
  );
});
