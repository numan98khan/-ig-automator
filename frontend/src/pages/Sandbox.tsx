import { useEffect, useMemo, useState } from 'react';
import {
  sandboxAPI,
  SandboxMessage,
  SandboxRunStep,
  SandboxScenario,
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Plus, Play, Save, Trash2, TestTube, MessageSquare } from 'lucide-react';

export default function Sandbox() {
  const { currentWorkspace } = useAuth();
  const [scenarios, setScenarios] = useState<SandboxScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [messages, setMessages] = useState<SandboxMessage[]>([{ role: 'customer', text: '' }]);
  const [runSteps, setRunSteps] = useState<SandboxRunStep[]>([]);
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
  };

  const handleSelectScenario = (scenario: SandboxScenario) => {
    setSelectedScenarioId(scenario._id);
    setName(scenario.name);
    setDescription(scenario.description || '');
    setMessages(
      scenario.messages.length > 0 ? scenario.messages : [{ role: 'customer', text: '' }]
    );
    setRunSteps([]);
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

    try {
      const result = await sandboxAPI.runScenario(selectedScenarioId);
      setRunSteps(result.steps || []);
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

            {runSteps.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium">Simulation Results</h3>
                <div className="space-y-3">
                  {runSteps.map((step, index) => (
                    <div key={index} className="p-3 border border-border rounded-lg space-y-2">
                      <div className="text-xs text-muted-foreground">Step {index + 1}</div>
                      <div className="p-3 rounded-md bg-muted text-sm">
                        <strong>Customer:</strong> {step.customerText}
                      </div>
                      <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-sm">
                        <strong>AI Reply:</strong> {step.aiReplyText}
                      </div>
                      {step.meta && (
                        <div className="p-3 rounded-md bg-muted/50 text-sm space-y-2">
                          <div className="flex gap-2 flex-wrap">
                            {step.meta.categoryName && <Badge variant="secondary">{step.meta.categoryName}</Badge>}
                            {step.meta.detectedLanguage && (
                              <Badge variant="secondary">Lang: {step.meta.detectedLanguage}</Badge>
                            )}
                            {step.meta.goalMatched && step.meta.goalMatched !== 'none' && (
                              <Badge variant="secondary">Goal: {step.meta.goalMatched}</Badge>
                            )}
                            {step.meta.shouldEscalate && <Badge variant="secondary">Escalate</Badge>}
                          </div>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            {step.meta.escalationReason && <li>Escalation reason: {step.meta.escalationReason}</li>}
                            {step.meta.tags && step.meta.tags.length > 0 && (
                              <li>Tags: {step.meta.tags.join(', ')}</li>
                            )}
                            {step.meta.knowledgeItemsUsed && step.meta.knowledgeItemsUsed.length > 0 && (
                              <li>
                                Knowledge used: {step.meta.knowledgeItemsUsed.map((item) => item.title).join(', ')}
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
