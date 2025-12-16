import { useEffect, useMemo, useState } from 'react';
import {
  sandboxAPI,
  SandboxMessage,
  SandboxRunStep,
  SandboxScenario,
  SandboxRun,
  WorkspaceSettings,
  GoalType,
  settingsAPI,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
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

export default function Sandbox() {
  const { currentWorkspace } = useAuth();
  const [scenarios, setScenarios] = useState<SandboxScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [messages, setMessages] = useState<SandboxMessage[]>([{ role: 'customer', text: '' }]);
  const [runSteps, setRunSteps] = useState<SandboxRunStep[]>([]);
  const [runConfig, setRunConfig] = useState<Partial<WorkspaceSettings>>({});
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings | null>(null);
  const [runHistory, setRunHistory] = useState<SandboxRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [openDetailIndex, setOpenDetailIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [quickRunning, setQuickRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState('');
  const [quickStep, setQuickStep] = useState<SandboxRunStep | null>(null);

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
    setQuickInput('');
    setQuickStep(null);
  };

  const handleSelectScenario = (scenario: SandboxScenario) => {
    setSelectedScenarioId(scenario._id);
    setName(scenario.name);
    setDescription(scenario.description || '');
    setMessages(
      scenario.messages.length > 0 ? scenario.messages : [{ role: 'customer', text: '' }]
    );
    setRunSteps([]);
    setRunHistory([]);
    setActiveRunId(null);
    setOpenDetailIndex(null);
    setViewingHistory(false);
    setRunConfig(snapshotSettings(workspaceSettings));
    setQuickStep(null);
    setQuickInput('');
    loadRunsForScenario(scenario._id);
  };

  const handleAddMessage = () => {
    setMessages((prev) => [...prev, { role: 'customer', text: '' }]);
  };

  const handleRemoveMessage = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMessageChange = (index: number, text: string) => {
    setMessages((prev) => prev.map((msg, i) => (i === index ? { ...msg, text } : msg)));
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

  const runQuickTest = async () => {
    if (!currentWorkspace || !quickInput.trim()) return;
    setQuickRunning(true);
    setError(null);
    setQuickStep(null);
    try {
      const result = await sandboxAPI.quickRun(currentWorkspace._id, quickInput.trim(), runConfig);
      setQuickStep(result.steps?.[0] || null);
      setSuccess('Preview generated');
    } catch (err: any) {
      console.error('Failed to run quick preview', err);
      setError(err.message || 'Failed to generate preview');
    } finally {
      setQuickRunning(false);
      setTimeout(() => setSuccess(null), 2000);
    }
  };

  const handleSelectRun = (run: SandboxRun) => {
    setActiveRunId(run._id);
    setRunSteps(run.steps || []);
    setRunConfig(run.settingsSnapshot || snapshotSettings(workspaceSettings));
    setOpenDetailIndex(null);
    setViewingHistory(true);
  };

  return (
    <div className="p-4 md:p-6 h-[calc(100vh-88px)]">
      {(error || success) && (
        <div className="mb-3 space-y-1">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
        </div>
      )}

      <div className="grid gap-4 h-full lg:grid-cols-[260px_1fr_320px]">
        {/* Left rail */}
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
                  <p className="text-xs text-muted-foreground">
                    No scenarios yet. Create one to start testing.
                  </p>
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
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {scenario.description}
                      </p>
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
                        activeRunId === run._id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted'
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

        {/* Center column */}
        <Card className="h-full flex flex-col overflow-hidden">
          <div className="p-4 border-b sticky top-0 bg-card z-10 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex-1 space-y-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Scenario name"
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    Mode: {effectiveConfig.decisionMode || 'assist'}
                  </Badge>
                  <Badge variant="secondary">
                    Goal: {effectiveConfig.primaryGoal || 'none'}
                  </Badge>
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

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Conversation Script</h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAddMessage}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add message
              </Button>
            </div>

            {messages.map((msg, index) => {
              const meta = runSteps[index]?.meta;
              const hasReply = Boolean(runSteps[index]?.aiReplyText);
              const detailsOpen = openDetailIndex === index;
              return (
                <div key={index} className="p-3 border border-border rounded-lg space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Step {index + 1} – Customer</span>
                    {messages.length > 1 && !viewingHistory && (
                      <button
                        className="text-destructive hover:underline"
                        onClick={() => handleRemoveMessage(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <textarea
                    className="w-full rounded-md border border-border bg-background p-2 text-sm focus:ring-2 focus:ring-primary"
                    rows={3}
                    value={msg.text}
                    onChange={(e) => handleMessageChange(index, e.target.value)}
                    placeholder="Customer says..."
                  />
                <div className="rounded-md bg-background border border-dashed border-border p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">AI Reply</span>
                    {running && <span>Simulating…</span>}
                  </div>
                  {hasReply ? (
                    <div
                        className={`p-3 rounded-md border ${
                          detailsOpen ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
                        }`}
                        onClick={() => setOpenDetailIndex(detailsOpen ? null : index)}
                    >
                      <p className="text-sm whitespace-pre-wrap">{runSteps[index].aiReplyText}</p>
                      {meta && (
                        <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
                          {meta.detectedLanguage && (
                            <Badge variant="secondary">Lang: {meta.detectedLanguage}</Badge>
                          )}
                          {meta.categoryName && <Badge variant="secondary">{meta.categoryName}</Badge>}
                          {meta.goalMatched && meta.goalMatched !== 'none' && (
                            <Badge variant="secondary">Goal: {meta.goalMatched}</Badge>
                          )}
                          <Badge variant="secondary">
                            Escalate: {meta.shouldEscalate ? 'Yes' : 'No'}
                          </Badge>
                          <Badge variant="secondary">Details</Badge>
                        </div>
                      )}
                        {detailsOpen && meta && (
                          <div className="mt-3 space-y-2 text-xs text-foreground">
                            {meta.tags && meta.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {meta.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {(meta.escalationReason || meta.goalMatched || meta.categoryName) && (
                              <div className="space-y-1 text-muted-foreground">
                                {meta.escalationReason && <p>Reason: {meta.escalationReason}</p>}
                                {meta.goalMatched && meta.goalMatched !== 'none' && <p>Goal: {meta.goalMatched}</p>}
                                {meta.categoryName && <p>Category: {meta.categoryName}</p>}
                              </div>
                            )}
                            {meta.knowledgeItemsUsed && meta.knowledgeItemsUsed.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-muted-foreground">Knowledge used</p>
                                <ul className="list-disc list-inside space-y-1">
                                  {meta.knowledgeItemsUsed.map((item) => (
                                    <li key={item.id}>{item.title}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Run a simulation to see the reply.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right configuration panel */}
        <Card className="h-full flex flex-col overflow-hidden">
          <div className="border-b p-3 text-sm font-medium">Run Configuration</div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Decision mode</p>
              <select
                className="w-full border rounded-md p-2 bg-background"
                value={runConfig.decisionMode || ''}
                onChange={(e) => setRunConfig((prev) => ({ ...prev, decisionMode: e.target.value as any }))}
              >
                <option value="">Use workspace default</option>
                <option value="full_auto">Full auto</option>
                <option value="assist">Assist</option>
                <option value="info_only">Info only</option>
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
                  onChange={(e) =>
                    setRunConfig((prev) => ({ ...prev, primaryGoal: (e.target.value as GoalType) || undefined }))
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

            <div className="pt-2 border-t mt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> Quick free-text test
                </p>
                <Button size="sm" variant="secondary" onClick={runQuickTest} disabled={quickRunning}>
                  {quickRunning ? 'Running…' : 'Test'}
                </Button>
              </div>
              <textarea
                className="w-full rounded-md border border-border bg-background p-2 text-sm focus:ring-2 focus:ring-primary"
                rows={4}
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder="Type a customer message to preview the AI reply"
              />
              {quickStep && (
                <div className="mt-2 p-3 border rounded-md bg-muted/30 space-y-2">
                  <div className="text-xs text-muted-foreground">Preview reply</div>
                  <p className="text-sm whitespace-pre-wrap">{quickStep.aiReplyText}</p>
                  {quickStep.meta && (
                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {quickStep.meta.detectedLanguage && (
                        <Badge variant="secondary">Lang: {quickStep.meta.detectedLanguage}</Badge>
                      )}
                      {quickStep.meta.categoryName && <Badge variant="secondary">{quickStep.meta.categoryName}</Badge>}
                      {quickStep.meta.goalMatched && quickStep.meta.goalMatched !== 'none' && (
                        <Badge variant="secondary">Goal: {quickStep.meta.goalMatched}</Badge>
                      )}
                      <Badge variant="secondary">
                        Escalate: {quickStep.meta.shouldEscalate ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
