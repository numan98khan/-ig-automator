import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const defaultEnvPath = path.join(process.cwd(), 'src', 'test', '.env.simulate-tests');
const fallbackEnvPath = path.join(process.cwd(), '.env.simulate-tests');
const envPath = process.env.SIM_TEST_ENV_PATH
  || (fs.existsSync(defaultEnvPath) ? defaultEnvPath : fallbackEnvPath);
dotenv.config({ path: envPath });

const logInfo = (message: string) => {
  console.log(`[simulate-tests] ${message}`);
};

type Expectation = {
  intent?: string;
  mode?: 'intent' | 'info_desk';
  replyIncludes?: string[];
  replyExcludes?: string[];
  maxSentences?: number;
  maxQuestions?: number;
};

type ScenarioMessage = {
  text: string;
  expect?: Expectation;
};

type Scenario = {
  name: string;
  messages: Array<ScenarioMessage | string>;
  expect?: Expectation;
  persona?: {
    name: string;
    handle?: string;
    userId?: string;
    avatarUrl?: string;
  };
};

type ScenarioFile = {
  scenarios: Scenario[];
};

type PreviewMessage = {
  id: string;
  from: 'customer' | 'ai';
  text: string;
  createdAt?: string;
};

type SimulationResponse = {
  success?: boolean;
  error?: string;
  buffered?: boolean;
  sessionId?: string;
  conversationId?: string;
  status?: 'active' | 'paused' | 'completed' | 'handoff';
  messages?: PreviewMessage[];
  selectedAutomation?: { id?: string; name?: string };
  diagnostics?: Array<Record<string, any>>;
  events?: Array<{ message?: string; createdAt?: string }>;
};

type ScenarioStepResult = {
  customerText: string;
  aiMessages: PreviewMessage[];
  detectedIntent?: string | null;
  inferredIntent?: string | null;
  status?: string | null;
  selectedAutomation?: { id?: string; name?: string } | null;
  diagnostics?: Array<Record<string, any>>;
  warnings: string[];
};

type ScenarioResult = {
  name: string;
  steps: ScenarioStepResult[];
  transcript: Array<{ from: 'customer' | 'ai'; text: string; createdAt?: string }>;
  warnings: string[];
};

const INTENTS = new Set([
  'greeting',
  'faq',
  'product_inquiry',
  'quote_request',
  'book_appointment',
  'order_request',
  'delivery_shipping',
  'order_status',
  'refund_return',
  'support_issue',
  'lead_capture',
  'human_handoff',
  'spam',
  'other',
  'none',
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const countSentences = (text: string): number => {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches ? matches.filter(Boolean).length : 0;
};

const countQuestions = (text: string): number => (text.match(/\?/g) || []).length;

const extractIntentFromEvents = (events?: Array<{ message?: string }>): string | null => {
  if (!events || events.length === 0) return null;
  for (const event of events) {
    const message = typeof event.message === 'string' ? event.message : '';
    const match = message.match(/Detected intent:\s*([^\s]+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
};

const inferIntentFromReply = (text: string | undefined): string | null => {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const handoffMatch = trimmed.match(/human required\s+([^\s]+)/i);
  if (handoffMatch?.[1]) {
    return handoffMatch[1].trim().toLowerCase();
  }
  const normalized = trimmed.toLowerCase();
  return INTENTS.has(normalized) ? normalized : null;
};

const normalizeScenarioMessages = (scenario: Scenario): ScenarioMessage[] => {
  const normalized = (scenario.messages || []).map((message) => {
    if (typeof message === 'string') {
      return { text: message };
    }
    return { text: message.text, expect: message.expect };
  });

  if (scenario.expect && normalized[0] && !normalized[0].expect) {
    normalized[0].expect = scenario.expect;
  }

  return normalized;
};

const loadScenarios = (scenarioPath: string): Scenario[] => {
  const raw = fs.readFileSync(scenarioPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed as Scenario[];
  if (parsed && Array.isArray(parsed.scenarios)) return parsed.scenarios as Scenario[];
  throw new Error('Scenario file must be an array or { scenarios: [...] }');
};

const createClient = (baseUrl: string, token?: string): AxiosInstance => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return axios.create({
    baseURL: baseUrl,
    timeout: 20000,
    headers,
  });
};

const resolveBaseUrl = () => {
  const raw = process.env.API_BASE_URL || 'http://localhost:5001';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const extractAiMessages = (messages: PreviewMessage[] | undefined, seenIds: Set<string>) => {
  const next: PreviewMessage[] = [];
  (messages || []).forEach((message) => {
    if (message.from !== 'ai') return;
    if (!message.id) return;
    if (seenIds.has(message.id)) return;
    seenIds.add(message.id);
    next.push(message);
  });
  return next;
};

const pollForNewAiMessages = async (client: AxiosInstance, workspaceId: string, baselineIds: Set<string>) => {
  const timeoutMs = Number(process.env.SIM_TEST_TIMEOUT_MS || 30000);
  const intervalMs = Number(process.env.SIM_TEST_POLL_MS || 1500);
  const start = Date.now();
  let lastSession: SimulationResponse | null = null;

  while (Date.now() - start < timeoutMs) {
    const { data } = await client.get<SimulationResponse>('/api/automations/simulate/session', {
      params: { workspaceId },
    });
    lastSession = data;
    const messages = (data.messages || []).filter((message) => message.from === 'ai');
    const newMessages = messages.filter((message) => message.id && !baselineIds.has(message.id));
    if (newMessages.length > 0) {
      return { messages: newMessages, session: data, timedOut: false };
    }
    await sleep(intervalMs);
  }

  return { messages: [], session: lastSession, timedOut: true };
};

const evaluateExpectations = (expect: Expectation | undefined, aiText: string | undefined, actualIntent: string | null) => {
  if (!expect) return [] as string[];
  const warnings: string[] = [];

  if (expect.intent && actualIntent && expect.intent !== actualIntent) {
    warnings.push(`Expected intent "${expect.intent}", got "${actualIntent}".`);
  }

  if (expect.mode) {
    const inferredMode = actualIntent && ['refund_return', 'support_issue', 'order_status', 'order_request', 'book_appointment', 'human_handoff'].includes(actualIntent)
      ? 'intent'
      : 'info_desk';
    if (expect.mode !== inferredMode) {
      warnings.push(`Expected mode "${expect.mode}", got "${inferredMode}".`);
    }
  }

  if (aiText && expect.replyIncludes) {
    expect.replyIncludes.forEach((fragment) => {
      if (!aiText.toLowerCase().includes(fragment.toLowerCase())) {
        warnings.push(`Reply missing expected fragment "${fragment}".`);
      }
    });
  }

  if (aiText && expect.replyExcludes) {
    expect.replyExcludes.forEach((fragment) => {
      if (aiText.toLowerCase().includes(fragment.toLowerCase())) {
        warnings.push(`Reply includes excluded fragment "${fragment}".`);
      }
    });
  }

  if (aiText && typeof expect.maxSentences === 'number') {
    const sentenceCount = countSentences(aiText);
    if (sentenceCount > expect.maxSentences) {
      warnings.push(`Reply has ${sentenceCount} sentences (max ${expect.maxSentences}).`);
    }
  }

  if (aiText && typeof expect.maxQuestions === 'number') {
    const questionCount = countQuestions(aiText);
    if (questionCount > expect.maxQuestions) {
      warnings.push(`Reply has ${questionCount} questions (max ${expect.maxQuestions}).`);
    }
  }

  return warnings;
};

async function run() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  const automationName = process.env.AUTOMATION_NAME;
  const baseUrl = resolveBaseUrl();
  const scenarioPath = process.env.SCENARIOS_PATH
    || path.join(process.cwd(), 'src', 'test', 'automationSimScenarios.json');
  const outputDirEnv = process.env.OUTPUT_DIR;
  const outputPathEnv = process.env.OUTPUT_PATH;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultOutputDir = path.join(process.cwd(), 'src', 'test', 'output');
  const outputDir = outputDirEnv || defaultOutputDir;
  let outputPath = '';

  if (outputPathEnv) {
    if (outputPathEnv.endsWith('.json')) {
      const ext = path.extname(outputPathEnv);
      const base = path.basename(outputPathEnv, ext);
      const dir = path.dirname(outputPathEnv);
      outputPath = path.join(dir, `${base}-${timestamp}${ext}`);
    } else {
      outputPath = path.join(outputPathEnv, `automation-sim-results-${timestamp}.json`);
    }
  } else {
    outputPath = path.join(outputDir, `automation-sim-results-${timestamp}.json`);
  }

  if (!email || !password || !automationName) {
    console.error('Missing required env vars: TEST_EMAIL, TEST_PASSWORD, AUTOMATION_NAME');
    process.exit(1);
  }

  if (!fs.existsSync(scenarioPath)) {
    console.error(`Scenario file not found: ${scenarioPath}`);
    process.exit(1);
  }

  logInfo(`Using env file: ${envPath}`);
  logInfo(`API base URL: ${baseUrl}`);
  logInfo(`Scenario file: ${scenarioPath}`);
  logInfo(`Output file: ${outputPath}`);

  const authClient = createClient(baseUrl);
  const loginResponse = await authClient.post('/api/auth/login', { email, password });
  const token = loginResponse.data?.token;
  if (!token) {
    console.error('Login failed: no token returned');
    process.exit(1);
  }
  logInfo('Authenticated successfully.');

  const client = createClient(baseUrl, token);
  const workspaceId = process.env.WORKSPACE_ID;
  let resolvedWorkspaceId = workspaceId;
  if (!resolvedWorkspaceId) {
    const workspaceResponse = await client.get('/api/workspaces');
    const workspaces = workspaceResponse.data || [];
    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      console.error('No workspaces available for this user.');
      process.exit(1);
    }
    resolvedWorkspaceId = workspaces[0]._id || workspaces[0].id;
  }

  if (!resolvedWorkspaceId) {
    console.error('Unable to resolve workspace ID.');
    process.exit(1);
  }

  const automationResponse = await client.get(`/api/automations/workspace/${resolvedWorkspaceId}`);
  const automations = Array.isArray(automationResponse.data) ? automationResponse.data : [];
  const automation = automations.find((item: any) =>
    typeof item?.name === 'string' && item.name.toLowerCase() === automationName.toLowerCase());
  if (!automation) {
    console.error(`Automation "${automationName}" not found in workspace ${resolvedWorkspaceId}.`);
    console.error(`Available automations: ${automations.map((item: any) => item?.name).filter(Boolean).join(', ')}`);
    process.exit(1);
  }

  logInfo(`Workspace: ${resolvedWorkspaceId}`);
  logInfo(`Target automation: ${automationName}`);

  const scenarios = loadScenarios(scenarioPath);
  logInfo(`Loaded ${scenarios.length} scenario(s).`);
  const results: ScenarioResult[] = [];

  for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
    const scenario = scenarios[scenarioIndex];
    const messages = normalizeScenarioMessages(scenario);
    const transcript: ScenarioResult['transcript'] = [];
    const steps: ScenarioStepResult[] = [];
    const warnings: string[] = [];

    logInfo(`Scenario ${scenarioIndex + 1}/${scenarios.length}: ${scenario.name}`);

    let sessionId: string | undefined;
    let seenAiIds = new Set<string>();
    let selectedAutomation = null as ScenarioStepResult['selectedAutomation'];

    for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
      const entry = messages[messageIndex];
      const previewText = entry.text.length > 120 ? `${entry.text.slice(0, 117)}...` : entry.text;
      logInfo(`Message ${messageIndex + 1}/${messages.length}: ${previewText}`);
      const baselineIds = new Set(seenAiIds);
      const clientSentAt = new Date().toISOString();
      transcript.push({ from: 'customer', text: entry.text, createdAt: clientSentAt });

      let response: SimulationResponse | null = null;
      try {
        const { data } = await client.post<SimulationResponse>('/api/automations/simulate/message', {
          workspaceId: resolvedWorkspaceId,
          text: entry.text,
          sessionId,
          reset: messageIndex === 0,
          persona: messageIndex === 0 ? scenario.persona : undefined,
          clientSentAt,
        });
        response = data;
      } catch (error: any) {
        const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error';
        steps.push({
          customerText: entry.text,
          aiMessages: [],
          warnings: [`Simulation request failed: ${errorMessage}`],
        });
        warnings.push(`Scenario step failed: ${errorMessage}`);
        break;
      }

      sessionId = response.sessionId || sessionId;
      selectedAutomation = response.selectedAutomation || selectedAutomation;
      const detectedIntent = extractIntentFromEvents(response.events);
      const immediateAiMessages = extractAiMessages(response.messages, seenAiIds);

      let aiMessages = immediateAiMessages;
      let latestSession = response;

      if (aiMessages.length === 0) {
        const polled = await pollForNewAiMessages(client, resolvedWorkspaceId, baselineIds);
        latestSession = polled.session || response;
        aiMessages = extractAiMessages(polled.messages, seenAiIds);
        if (polled.timedOut && aiMessages.length === 0) {
          warnings.push('Timed out waiting for AI response.');
          logInfo('Timed out waiting for AI response.');
        }
      }

      if (aiMessages.length > 0) {
        logInfo(`Received ${aiMessages.length} AI message(s).`);
      }

      aiMessages.forEach((message) => {
        transcript.push({ from: 'ai', text: message.text, createdAt: message.createdAt });
      });

      const latestAi = aiMessages[aiMessages.length - 1];
      const inferredIntent = inferIntentFromReply(latestAi?.text) || detectedIntent;
      const stepWarnings = evaluateExpectations(entry.expect, latestAi?.text, inferredIntent);

      steps.push({
        customerText: entry.text,
        aiMessages,
        detectedIntent,
        inferredIntent,
        status: latestSession?.status || null,
        selectedAutomation,
        diagnostics: latestSession?.diagnostics,
        warnings: stepWarnings,
      });

      warnings.push(...stepWarnings);
    }

    results.push({
      name: scenario.name,
      steps,
      transcript,
      warnings,
    });
  }

  const resolvedOutputDir = path.dirname(outputPath);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    automationName,
    workspaceId: resolvedWorkspaceId,
    baseUrl,
    scenarioCount: results.length,
    results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  console.log(`✅ Simulation tests completed. Results saved to ${outputPath}`);

  const warningCount = results.reduce((sum, scenario) => sum + scenario.warnings.length, 0);
  if (warningCount > 0) {
    console.log(`⚠️  ${warningCount} warning(s) recorded. See output file for details.`);
  }
}

run().catch((error) => {
  console.error('❌ Simulation tests failed:', error);
  process.exit(1);
});
