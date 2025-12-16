import { useEffect, useMemo, useState } from 'react';
import {
  sandboxAPI,
  SandboxMessage,
  SandboxRunStep,
  SandboxScenario,
  SandboxRun,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Plus, Play, Save, Trash2, TestTube, MessageSquare, Clock } from 'lucide-react';

export default function Sandbox() {
  const { currentWorkspace } = useAuth();
  const [scenarios, setScenarios] = useState<SandboxScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [messages, setMessages] = useState<SandboxMessage[]>([{ role: 'customer', text: '' }]);
  const [runSteps, setRunSteps] = useState<SandboxRunStep[]>([]);
  const [runConfig, setRunConfig] = useState<Record<string, any> | undefined>();
  const [runHistory, setRunHistory] = useState<SandboxRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s._id === selectedScenarioId) || null,
    [scenarios, selectedScenarioId]
  );

  useEffect(() => {
    if (currentWorkspace) {
      loadScenarios();
    }
  }, [currentWorkspace]);

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
    setRunConfig(undefined);
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
    setRunConfig(undefined);
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
      if (history.length > 0) {
        const latest = history[0];
        setActiveRunId(latest._id);
        setRunSteps(latest.steps || []);
        setRunConfig(latest.settingsSnapshot);
      }
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
    setRunConfig(undefined);
    setRunSteps(messages.map((msg) => ({ customerText: msg.text, aiReplyText: '' })));

    try {
      const result = await sandboxAPI.runScenario(selectedScenarioId);
      const newRun: SandboxRun = {
        _id: result.runId,
        runId: result.runId,
        steps: result.steps || [],
        createdAt: result.createdAt,
        settingsSnapshot: result.settingsSnapshot,
      };

      setRunSteps(newRun.steps);
      setRunConfig(newRun.settingsSnapshot);
      setActiveRunId(newRun._id);
      setRunHistory((prev) => [newRun, ...prev]);
      setSuccess('Simulation complete');
    } catch (err: any) {
      console.error('Failed to run simulation', err);
      setError(err.message || 'Failed to run simulation');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TestTube className="w-6 h-6 text-primary" /> Sandbox
          </h1>
          <p className="text-sm text-muted-foreground">
            Draft conversation scripts and see how the bot responds without touching Instagram.
          </p>
        </div>
        <Button variant="secondary" onClick={resetForm} leftIcon={<Plus className="w-4 h-4" />}>
          New Scenario
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Saved Scenarios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {scenarios.length === 0 && (
              <p className="text-sm text-muted-foreground">No scenarios yet. Create one to start testing.</p>
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
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="w-4 h-4" /> Scenario Editor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {success && <p className="text-sm text-emerald-600">{success}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome flow" />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">Description</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short summary"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Customer Messages</h3>
                <Button size="sm" variant="secondary" onClick={handleAddMessage} leftIcon={<Plus className="w-4 h-4" />}>
                  Add message
                </Button>
              </div>

              {messages.map((msg, index) => (
                <div key={index} className="p-3 border border-border rounded-lg space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Step {index + 1} – Customer message</span>
                    {messages.length > 1 && (
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
                  <div className="p-3 rounded-md bg-muted text-sm space-y-1">
                    <div className="font-medium flex items-center justify-between">
                      <span>AI Reply</span>
                      {running && <span className="text-xs text-muted-foreground">Simulating…</span>}
                    </div>
                    {runSteps[index]?.aiReplyText ? (
                      <>
                        <div className="p-2 rounded-md bg-primary/5 border border-primary/20">
                          {runSteps[index].aiReplyText}
                        </div>
                        {runSteps[index].meta && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex gap-2 flex-wrap">
                              {runSteps[index].meta.categoryName && (
                                <Badge variant="secondary">{runSteps[index].meta.categoryName}</Badge>
                              )}
                              {runSteps[index].meta.detectedLanguage && (
                                <Badge variant="secondary">Lang: {runSteps[index].meta.detectedLanguage}</Badge>
                              )}
                              {runSteps[index].meta.goalMatched && runSteps[index].meta.goalMatched !== 'none' && (
                                <Badge variant="secondary">Goal: {runSteps[index].meta.goalMatched}</Badge>
                              )}
                              {runSteps[index].meta.shouldEscalate && <Badge variant="secondary">Escalate</Badge>}
                            </div>
                            <ul className="list-disc list-inside space-y-1">
                              {runSteps[index].meta.escalationReason && (
                                <li>Escalation reason: {runSteps[index].meta.escalationReason}</li>
                              )}
                              {runSteps[index].meta.tags && runSteps[index].meta.tags.length > 0 && (
                                <li>Tags: {runSteps[index].meta.tags.join(', ')}</li>
                              )}
                              {runSteps[index].meta.knowledgeItemsUsed &&
                                runSteps[index].meta.knowledgeItemsUsed.length > 0 && (
                                  <li>
                                    Knowledge used:{' '}
                                    {runSteps[index].meta.knowledgeItemsUsed.map((item) => item.title).join(', ')}
                                  </li>
                                )}
                            </ul>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No simulation result yet.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={saveScenario} disabled={loading} leftIcon={<Save className="w-4 h-4" />}>
                {selectedScenario ? 'Save Scenario' : 'Create Scenario'}
              </Button>
              <Button
                variant="primary"
                onClick={runScenario}
                disabled={running || !selectedScenarioId}
                leftIcon={<Play className="w-4 h-4" />}
              >
                {running ? 'Running...' : 'Run Simulation'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {runHistory.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-4 h-4" /> Simulation History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[60vh] overflow-y-auto">
              {runHistory.map((run) => (
                <div
                  key={run._id}
                  className={`p-3 rounded-lg border transition cursor-pointer ${
                    activeRunId === run._id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                  }`}
                  onClick={() => {
                    setActiveRunId(run._id);
                    setRunSteps(run.steps || []);
                    setRunConfig(run.settingsSnapshot);
                  }}
                >
                  <p className="text-sm font-medium">Run {run._id.slice(-6)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Run Configuration</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {runConfig ? (
                <>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Decision mode</p>
                    <p className="font-medium">{runConfig.decisionMode || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Default language</p>
                    <p className="font-medium">{runConfig.defaultLanguage || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Reply language</p>
                    <p className="font-medium">{runConfig.defaultReplyLanguage || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Primary goal</p>
                    <p className="font-medium">{runConfig.primaryGoal || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Secondary goal</p>
                    <p className="font-medium">{runConfig.secondaryGoal || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Human escalation</p>
                    <p className="font-medium">{runConfig.humanEscalationBehavior || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Max reply sentences</p>
                    <p className="font-medium">{runConfig.maxReplySentences ?? '—'}</p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-muted-foreground">Escalation guidelines</p>
                    <p className="font-medium whitespace-pre-wrap">{runConfig.escalationGuidelines || '—'}</p>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">Run a simulation to see the configuration used.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
