import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sandboxAPI,
  SandboxMessage,
  SandboxRunStep,
  SandboxScenario,
  SandboxRun,
  WorkspaceSettings,
  GoalType,
  settingsAPI,
  SandboxRunStepMeta,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import {
  Plus,
  Play,
  Save,
  Trash2,
  TestTube,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Info,
  Send,
  Settings,
} from 'lucide-react';

function snapshotSettings(settings?: WorkspaceSettings | null): Partial<WorkspaceSettings> {
  if (!settings) return {};
  return {
    decisionMode: settings.decisionMode,
    defaultLanguage: settings.defaultLanguage,
    defaultReplyLanguage: settings.defaultReplyLanguage,
    maxReplySentences: settings.maxReplySentences,
    primaryGoal: settings.primaryGoal,
    secondaryGoal: settings.secondaryGoal,
    goalConfigs: settings.goalConfigs,
    humanEscalationBehavior: settings.humanEscalationBehavior,
    escalationGuidelines: settings.escalationGuidelines,
    humanHoldMinutes: settings.humanHoldMinutes,
  };
}

function runSummary(run: SandboxRun) {
  const steps = run.steps || [];
  const escalations = steps.filter((s) => s.meta?.shouldEscalate).length;
  const goals = Array.from(new Set(steps.map((s) => s.meta?.goalMatched).filter(Boolean))) as GoalType[];
  const goalLabel = goals.find((g) => g && g !== 'none');
  const parts = [
    `${steps.length} steps`,
    goalLabel ? `Goal: ${goalLabel}` : null,
    escalations ? `${escalations} escalations` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function metaBadges(meta?: SandboxRunStepMeta) {
  if (!meta) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
      {meta.detectedLanguage && <Badge variant="secondary">Lang: {meta.detectedLanguage}</Badge>}
      {meta.categoryName && <Badge variant="secondary">{meta.categoryName}</Badge>}
      {meta.goalMatched && meta.goalMatched !== 'none' && <Badge variant="secondary">Goal: {meta.goalMatched}</Badge>}
      <Badge variant="secondary">Escalate: {meta.shouldEscalate ? 'Yes' : 'No'}</Badge>
    </div>
  );
}

export default function Sandbox() {
  const { currentWorkspace } = useAuth();
  const [scenarios, setScenarios] = useState<SandboxScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scenario' | 'live'>('scenario');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [messages, setMessages] = useState<SandboxMessage[]>([{ role: 'customer', text: '' }]);
  const [, setRunSteps] = useState<SandboxRunStep[]>([]);
  const [runConfig, setRunConfig] = useState<Partial<WorkspaceSettings>>({});
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings | null>(null);
  const [runHistory, setRunHistory] = useState<SandboxRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [, setViewingHistory] = useState(false);
  const [, setOpenDetailIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'details' | 'settings'>('details');
  const [liveMessages, setLiveMessages] = useState<
    { from: 'customer' | 'ai'; text: string; meta?: SandboxRunStepMeta; typing?: boolean }[]
  >([]);
  const [liveInput, setLiveInput] = useState('');
  const [liveSending, setLiveSending] = useState(false);
  const [selectedTurnIndex, setSelectedTurnIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const liveScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s._id === selectedScenarioId) || null,
    [scenarios, selectedScenarioId]
  );

  const effectiveConfig = useMemo(() => {
    return { ...snapshotSettings(workspaceSettings), ...runConfig };
  }, [workspaceSettings, runConfig]);

  useEffect(() => {
    if (currentWorkspace) {
      loadWorkspaceSettings();
      loadScenarios();
    }
  }, [currentWorkspace]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange as any);
    return () => mediaQuery.removeEventListener('change', handleChange as any);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setActiveTab('live');
    }
  }, [isMobile]);

  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveMessages]);

  const loadWorkspaceSettings = async () => {
    if (!currentWorkspace) return;
    try {
      const data = await settingsAPI.getByWorkspace(currentWorkspace._id);
      setWorkspaceSettings(data);
      setRunConfig(snapshotSettings(data));
    } catch (err: any) {
      console.error('Failed to load workspace settings', err);
      setError(err.message || 'Failed to load workspace settings');
    }
  };

  const loadScenarios = async () => {
    if (!currentWorkspace) return;
    try {
      const data = await sandboxAPI.listScenarios(currentWorkspace._id);
      setScenarios(data);
    } catch (err: any) {
      console.error('Failed to load scenarios', err);
      setError(err.message || 'Failed to load scenarios');
    }
  };

  const resetForm = () => {
    setSelectedScenarioId(null);
    setName('');
    setDescription('');
    setMessages([{ role: 'customer', text: '' }]);
    setRunSteps([]);
    setRunHistory([]);
    setActiveRunId(null);
    setOpenDetailIndex(null);
    setViewingHistory(false);
    setRunConfig(snapshotSettings(workspaceSettings));
    setActiveTab('scenario');
  };

  const handleSelectScenario = (scenario: SandboxScenario) => {
    setSelectedScenarioId(scenario._id);
    setName(scenario.name);
    setDescription(scenario.description || '');
    setMessages(scenario.messages.length > 0 ? scenario.messages : [{ role: 'customer', text: '' }]);
    setRunSteps([]);
    setRunHistory([]);
    setActiveRunId(null);
    setOpenDetailIndex(null);
    setViewingHistory(false);
    setRunConfig(snapshotSettings(workspaceSettings));
    setActiveTab('scenario');
    loadRunsForScenario(scenario._id);
  };

  const loadRunsForScenario = async (scenarioId: string) => {
    try {
      const history = await sandboxAPI.listRuns(scenarioId);
      setRunHistory(history);
    } catch (err: any) {
      console.error('Failed to load runs', err);
      setError(err.message || 'Failed to load simulation history');
    }
  };

  const saveScenario = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (selectedScenarioId) {
        const updated = await sandboxAPI.updateScenario(selectedScenarioId, {
          name,
          description,
          messages,
        });
        setScenarios((prev) => prev.map((s) => (s._id === updated._id ? updated : s)));
        setSuccess('Scenario updated');
      } else {
        const created = await sandboxAPI.createScenario({
          workspaceId: currentWorkspace._id,
          name,
          description,
          messages,
        });
        setScenarios((prev) => [created, ...prev]);
        setSelectedScenarioId(created._id);
        setSuccess('Scenario created');
      }
    } catch (err: any) {
      console.error('Failed to save scenario', err);
      setError(err.message || 'Failed to save scenario');
    } finally {
      setLoading(false);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const deleteScenario = async (scenarioId: string) => {
    if (!scenarioId) return;
    try {
      await sandboxAPI.deleteScenario(scenarioId);
      setScenarios((prev) => prev.filter((s) => s._id !== scenarioId));
      if (selectedScenarioId === scenarioId) {
        resetForm();
      }
    } catch (err: any) {
      console.error('Failed to delete scenario', err);
      setError(err.message || 'Failed to delete scenario');
    }
  };

  const runScenario = async () => {
    if (!selectedScenarioId) {
      setError('Save and select a scenario before running.');
      return;
    }

    setRunning(true);
    setError(null);
    setSuccess(null);
    setOpenDetailIndex(null);
    setViewingHistory(false);
    setRunSteps(messages.map((msg) => ({ customerText: msg.text, aiReplyText: '' })));

    try {
      const result = await sandboxAPI.runScenario(selectedScenarioId, runConfig);
      const newRun: SandboxRun = {
        _id: result.runId,
        runId: result.runId,
        steps: result.steps || [],
        createdAt: result.createdAt,
        settingsSnapshot: result.settingsSnapshot,
      };

      setRunSteps(newRun.steps);
      setRunConfig(newRun.settingsSnapshot || runConfig);
      setActiveRunId(newRun._id);
      setOpenDetailIndex(null);
      setViewingHistory(true);
      setRunHistory((prev) => [newRun, ...prev]);
      setSuccess('Simulation complete');
    } catch (err: any) {
      console.error('Failed to run simulation', err);
      setError(err.message || 'Failed to run simulation');
    } finally {
      setRunning(false);
    }
  };

  const sendLiveMessage = async () => {
    if (!currentWorkspace || !liveInput.trim()) return;

    const customerText = liveInput.trim();
    const priorCustomerMessages = liveMessages.filter((m) => m.from === 'customer').map((m) => m.text);
    const customerSequence = [...priorCustomerMessages, customerText];

    setLiveSending(true);
    setError(null);

    const optimisticMessages: {
      from: 'customer' | 'ai';
      text: string;
      meta?: SandboxRunStepMeta;
      typing?: boolean;
    }[] = [
      ...liveMessages,
      { from: 'customer', text: customerText },
      { from: 'ai', text: 'Thinking…', typing: true },
    ];
    setLiveMessages(optimisticMessages);
    setLiveInput('');

    try {
      const result = await sandboxAPI.quickRun(currentWorkspace._id, customerSequence, runConfig);
      const lastStep = result.steps[result.steps.length - 1];

      setLiveMessages((prev) => {
        const updated = [...prev];
        const typingIndex = updated.findIndex((m) => m.typing);
        const aiMessage = { from: 'ai' as const, text: lastStep?.aiReplyText || '', meta: lastStep?.meta };

        if (typingIndex >= 0) {
          updated[typingIndex] = aiMessage;
          setSelectedTurnIndex(typingIndex);
        } else {
          updated.push(aiMessage);
          setSelectedTurnIndex(updated.length - 1);
        }

        return updated;
      });
    } catch (err: any) {
      console.error('Failed to send live test message', err);
      setError(err.message || 'Failed to run live test');
      setLiveMessages((prev) => prev.filter((m) => !m.typing));
    } finally {
      setLiveSending(false);
    }
  };

  const handleSelectRun = (run: SandboxRun) => {
    setActiveRunId(run._id);
    setRunSteps(run.steps || []);
    setRunConfig(run.settingsSnapshot || snapshotSettings(workspaceSettings));
    setOpenDetailIndex(null);
    setViewingHistory(true);
  };

  const selectedLiveTurn = useMemo(() => {
    if (selectedTurnIndex === null) return null;
    return liveMessages[selectedTurnIndex] || null;
  }, [liveMessages, selectedTurnIndex]);

  const renderSettingsForm = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Decision mode</p>
        <select
          className="w-full border rounded-md p-2 bg-background"
          value={runConfig.decisionMode || ''}
          onChange={(e) => setRunConfig((prev) => ({ ...prev, decisionMode: e.target.value as any }))}
        >
          <option value="">Use workspace default</option>
          <option value="assist">Assist</option>
          <option value="auto">Auto</option>
        </select>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Reply language</p>
        <Input
          value={runConfig.defaultReplyLanguage || ''}
          onChange={(e) => setRunConfig((prev) => ({ ...prev, defaultReplyLanguage: e.target.value }))}
          placeholder="e.g. en"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Primary goal</p>
          <select
            className="w-full border rounded-md p-2 bg-background"
            value={runConfig.primaryGoal || ''}
            onChange={(e) => setRunConfig((prev) => ({ ...prev, primaryGoal: (e.target.value as GoalType) || undefined }))}
          >
            <option value="">Use workspace default</option>
            <option value="none">None</option>
            <option value="capture_lead">Capture lead</option>
            <option value="book_appointment">Book appointment</option>
            <option value="start_order">Start order</option>
            <option value="handle_support">Handle support</option>
            <option value="drive_to_channel">Drive to channel</option>
          </select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Secondary goal</p>
          <select
            className="w-full border rounded-md p-2 bg-background"
            value={runConfig.secondaryGoal || ''}
            onChange={(e) =>
              setRunConfig((prev) => ({ ...prev, secondaryGoal: (e.target.value as GoalType) || undefined }))
            }
          >
            <option value="">Use workspace default</option>
            <option value="none">None</option>
            <option value="capture_lead">Capture lead</option>
            <option value="book_appointment">Book appointment</option>
            <option value="start_order">Start order</option>
            <option value="handle_support">Handle support</option>
            <option value="drive_to_channel">Drive to channel</option>
          </select>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Max reply sentences</p>
        <Input
          type="number"
          value={runConfig.maxReplySentences ?? ''}
          onChange={(e) =>
            setRunConfig((prev) => ({
              ...prev,
              maxReplySentences: e.target.value === '' ? undefined : Number(e.target.value),
            }))
          }
          placeholder="Use workspace default"
        />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Human escalation behavior</p>
        <select
          className="w-full border rounded-md p-2 bg-background"
          value={runConfig.humanEscalationBehavior || ''}
          onChange={(e) =>
            setRunConfig((prev) => ({
              ...prev,
              humanEscalationBehavior: (e.target.value as any) || undefined,
            }))
          }
        >
          <option value="">Use workspace default</option>
          <option value="ai_silent">AI silent</option>
          <option value="ai_allowed">AI allowed</option>
        </select>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="w-4 h-4 text-primary" /> Applies to both scenario simulations and live chat runs.
      </div>
    </div>
  );

  const renderTurnDetails = () => {
    if (effectiveTab !== 'live') {
      return <p>Details are shown inline in the scenario script.</p>;
    }

    if (selectedLiveTurn && selectedLiveTurn.meta) {
      return (
        <>
          <p className="text-xs text-muted-foreground">Inspecting latest AI turn.</p>
          <div className="space-y-1 text-foreground">
            {selectedLiveTurn.meta.detectedLanguage && (
              <p>Detected language: {selectedLiveTurn.meta.detectedLanguage}</p>
            )}
            {selectedLiveTurn.meta.categoryName && <p>Category: {selectedLiveTurn.meta.categoryName}</p>}
            {selectedLiveTurn.meta.goalMatched && selectedLiveTurn.meta.goalMatched !== 'none' && (
              <p>Goal hit: {selectedLiveTurn.meta.goalMatched}</p>
            )}
            <p>Escalate: {selectedLiveTurn.meta.shouldEscalate ? 'Yes' : 'No'}</p>
            {selectedLiveTurn.meta.escalationReason && <p>Reason: {selectedLiveTurn.meta.escalationReason}</p>}
            {selectedLiveTurn.meta.tags && selectedLiveTurn.meta.tags.length > 0 && (
              <p>Tags: {selectedLiveTurn.meta.tags.join(', ')}</p>
            )}
            {selectedLiveTurn.meta.knowledgeItemsUsed && selectedLiveTurn.meta.knowledgeItemsUsed.length > 0 && (
              <div>
                <p className="font-medium text-sm">Knowledge used</p>
                <ul className="list-disc list-inside text-xs text-muted-foreground">
                  {selectedLiveTurn.meta.knowledgeItemsUsed.map((item) => (
                    <li key={item.id}>{item.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      );
    }

    return <p>Select an AI reply from the live chat to see details.</p>;
  };

  const effectiveTab = isMobile ? 'live' : activeTab;

  return (
    <div className="p-4 md:p-6 min-h-[calc(100vh-88px)] flex flex-col bg-background">
      {(error || success) && (
        <div className="mb-3 space-y-1">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
        </div>
      )}

      <div
        className={
          isMobile
            ? 'flex flex-col gap-4 flex-1 min-h-0'
            : 'grid gap-4 flex-1 min-h-0 lg:grid-cols-[260px_1fr_320px]'
        }
      >
        {!isMobile && (
          <Card className="h-full flex flex-col">
            <div className="p-4 border-b flex items-center justify-between gap-2">
              <div>
                <div className="text-lg font-semibold flex items-center gap-2">
                  <TestTube className="w-5 h-5 text-primary" /> Sandbox
                </div>
                <p className="text-xs text-muted-foreground">Simulate without touching Instagram.</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={resetForm}
                leftIcon={<Plus className="w-4 h-4" />}
                title="New scenario"
              >
                <span className="sr-only">New Scenario</span>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Saved Scenarios
                  </div>
                  <span className="text-xs">{scenarios.length}</span>
                </div>
                <div className="space-y-2">
                  {scenarios.length === 0 && (
                    <p className="text-xs text-muted-foreground">No scenarios yet. Create one to start testing.</p>
                  )}
                  {scenarios.map((scenario) => (
                    <div
                      key={scenario._id}
                      className={`p-3 rounded-lg border transition cursor-pointer ${
                        selectedScenarioId === scenario._id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted'
                      }`}
                      onClick={() => handleSelectScenario(scenario)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{scenario.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Updated {new Date(scenario.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteScenario(scenario._id);
                          }}
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete scenario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {scenario.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{scenario.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <button
                  className="w-full flex items-center justify-between text-sm font-medium text-left"
                  onClick={() => setShowHistory((prev) => !prev)}
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="w-4 h-4" /> Simulation History
                  </span>
                  {showHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {showHistory && (
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
                    {runHistory.length === 0 && (
                      <p className="text-xs text-muted-foreground">No runs yet for this scenario.</p>
                    )}
                    {runHistory.map((run) => (
                      <div
                        key={run._id}
                        className={`p-3 rounded-lg border transition cursor-pointer ${
                          activeRunId === run._id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                        }`}
                        onClick={() => handleSelectRun(run)}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Run {run._id.slice(-6)}</span>
                          <span>{new Date(run.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{runSummary(run)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {isMobile ? (
          <div className="flex flex-col flex-1 min-h-0 bg-background">
            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2 border-b">
              <p className="text-sm font-medium">Live test chat</p>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Settings className="w-4 h-4" />}
                onClick={() => setShowConfigModal(true)}
              >
                Run config
              </Button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <div
                ref={liveScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 bg-gradient-to-b from-background to-muted/30"
              >
                {liveMessages.length === 0 && (
                  <div className="text-sm text-muted-foreground">Send a message to start a sandbox chat.</div>
                )}
                {liveMessages.map((msg, idx) => {
                  const isAI = msg.from === 'ai';
                  return (
                    <div
                      key={idx}
                      className={`flex w-full ${isAI ? 'justify-start' : 'justify-end'}`}
                      onClick={() => isAI && setSelectedTurnIndex(idx)}
                    >
                      <div className={`flex flex-col max-w-[85%] space-y-1 ${isAI ? 'items-start' : 'items-end'}`}>
                        <div
                          className={`rounded-2xl px-3 py-2 shadow-sm border ${
                            msg.typing
                              ? 'bg-muted text-muted-foreground border-border'
                              : isAI
                                ? selectedTurnIndex === idx
                                  ? 'bg-primary/10 border-primary text-foreground'
                                  : 'bg-muted border-border text-foreground'
                                : 'bg-primary text-primary-foreground border-primary'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">
                            {msg.typing ? 'Thinking…' : msg.text}
                          </p>
                        </div>
                        {isAI && msg.meta && (
                          <div className="text-[11px] text-muted-foreground w-full">{metaBadges(msg.meta)}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t bg-background text-sm text-muted-foreground space-y-2">{renderTurnDetails()}</div>
              <div className="p-3 border-t bg-background flex items-center gap-2 sticky bottom-0">
                <Input
                  value={liveInput}
                  onChange={(e) => setLiveInput(e.target.value)}
                  placeholder="Type a test message..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendLiveMessage();
                    }
                  }}
                />
                <Button onClick={sendLiveMessage} disabled={liveSending} leftIcon={<Send className="w-4 h-4" />}>
                  {liveSending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Card className="h-full flex flex-col overflow-hidden min-h-0">
            <div className="border-b bg-card z-10">
              <div className="px-4 pt-4 flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  {!isMobile && (
                    <>
                      <Button
                        variant={effectiveTab === 'scenario' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('scenario')}
                      >
                        Scenario simulation
                      </Button>
                      <Button
                        variant={effectiveTab === 'live' ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setActiveTab('live')}
                      >
                        Live test chat
                      </Button>
                    </>
                  )}
                  {isMobile && <p className="text-sm font-medium">Live test chat</p>}
                </div>
                {isMobile && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Settings className="w-4 h-4" />}
                    onClick={() => setShowConfigModal(true)}
                  >
                    Run config
                  </Button>
                )}
              </div>

              {effectiveTab === 'scenario' ? (
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" />
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">Mode: {effectiveConfig.decisionMode || 'assist'}</Badge>
                        <Badge variant="secondary">Goal: {effectiveConfig.primaryGoal || 'none'}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={saveScenario}
                        disabled={loading}
                        leftIcon={<Save className="w-4 h-4" />}
                        title={selectedScenario ? 'Save Scenario' : 'Create Scenario'}
                      >
                        <span className="sr-only">{selectedScenario ? 'Save Scenario' : 'Create Scenario'}</span>
                      </Button>
                      <Button
                        variant="primary"
                        onClick={runScenario}
                        disabled={running || !selectedScenarioId}
                        leftIcon={<Play className="w-4 h-4" />}
                        title={running ? 'Running simulation' : activeRunId ? 'Re-run Simulation' : 'Run Simulation'}
                      >
                        <span className="sr-only">
                          {running ? 'Running simulation' : activeRunId ? 'Re-run Simulation' : 'Run Simulation'}
                        </span>
                      </Button>
                    </div>
                  </div>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
              ) : (
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">Mode: {effectiveConfig.decisionMode || 'assist'}</Badge>
                      <Badge variant="secondary">Lang: {effectiveConfig.defaultReplyLanguage || 'en'}</Badge>
                      <Badge variant="secondary">Primary: {effectiveConfig.primaryGoal || 'none'}</Badge>
                      <Badge variant="secondary">Secondary: {effectiveConfig.secondaryGoal || 'none'}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowConfigModal(true)}
                        leftIcon={<Settings className="w-4 h-4" />}
                      >
                        Run config
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setLiveMessages([])}>
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-[320px] rounded-lg border bg-background">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {liveMessages.length === 0 && (
                        <div className="text-sm text-muted-foreground">Send a message to start a sandbox chat.</div>
                      )}
                      {liveMessages.map((msg, idx) => {
                        const isAI = msg.from === 'ai';
                        return (
                          <div
                            key={idx}
                            className={`flex w-full ${isAI ? 'justify-start' : 'justify-end'}`}
                            onClick={() => isAI && setSelectedTurnIndex(idx)}
                          >
                            <div className={`flex flex-col max-w-[70%] space-y-1 ${isAI ? 'items-start' : 'items-end'}`}>
                              <div
                                className={`rounded-2xl px-3 py-2 shadow-sm border ${
                                  msg.typing
                                    ? 'bg-muted text-muted-foreground border-border'
                                    : isAI
                                      ? selectedTurnIndex === idx
                                        ? 'bg-primary/10 border-primary text-foreground'
                                        : 'bg-background border-border text-foreground'
                                      : 'bg-primary text-primary-foreground border-primary'
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap">
                                  {msg.typing ? 'Thinking…' : msg.text}
                                </p>
                              </div>
                              {isAI && msg.meta && (
                                <div className="text-[11px] text-muted-foreground w-full">{metaBadges(msg.meta)}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t p-3 flex items-center gap-2">
                      <Input
                        value={liveInput}
                        onChange={(e) => setLiveInput(e.target.value)}
                        placeholder="Type a test message..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendLiveMessage();
                          }
                        }}
                      />
                      <Button onClick={sendLiveMessage} disabled={liveSending} leftIcon={<Send className="w-4 h-4" />}>
                        {liveSending ? 'Sending…' : 'Send'}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4" /> Live chat uses sandbox mode and keeps state until you reset.
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span>Inspector shows AI metadata after each reply.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

          {!isMobile && (
            <Card className="h-full flex flex-col overflow-hidden">
              <div className="border-b p-4 flex gap-2">
                <Button
                  variant={inspectorTab === 'details' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setInspectorTab('details')}
                >
                  Turn details
                </Button>
                <Button
                  variant={inspectorTab === 'settings' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setInspectorTab('settings')}
                >
                  Session settings
                </Button>
              </div>

              {inspectorTab === 'details' ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-2 text-sm text-muted-foreground">
                  {renderTurnDetails()}
                </div>
              ) : (
                renderSettingsForm()
              )}
            </Card>
          )}
      </div>
      {isMobile && (
        <Modal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          title="Run configuration"
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setShowConfigModal(false)}>
              Close
            </Button>
          }
        >
          {renderSettingsForm()}
        </Modal>
      )}
    </div>
  );
}
