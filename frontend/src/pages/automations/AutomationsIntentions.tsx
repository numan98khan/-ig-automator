import React, { useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, Loader2, AlertCircle } from 'lucide-react';
import { automationIntentAPI, AutomationIntent } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const EMPTY_FORM = { value: '', description: '' };

export const AutomationsIntentions: React.FC = () => {
  const [intents, setIntents] = useState<AutomationIntent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIntents();
  }, []);

  const loadIntents = async () => {
    try {
      setInitialLoading(true);
      const data = await automationIntentAPI.list();
      setIntents(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load intentions:', err);
      setError('Failed to load intention classes');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleOpenModal = () => {
    setFormState(EMPTY_FORM);
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormState(EMPTY_FORM);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = formState.value.trim();
    const description = formState.description.trim();

    if (!value || !description) {
      setError('Intent key and description are required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await automationIntentAPI.create({ value, description });
      handleCloseModal();
      loadIntents();
    } catch (err: any) {
      console.error('Failed to create intention:', err);
      setError(err?.response?.data?.error || 'Failed to create intention');
    } finally {
      setLoading(false);
    }
  };

  const filteredIntents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return intents;
    return intents.filter((intent) =>
      intent.value.toLowerCase().includes(query)
      || intent.description.toLowerCase().includes(query)
    );
  }, [intents, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Intentions</h2>
          <p className="text-sm text-muted-foreground">
            Use these intent classes in automation routing and detection. You can add custom intent labels for your workspace.
          </p>
        </div>
        <Button onClick={handleOpenModal} leftIcon={<Plus className="w-4 h-4" />}>
          New intention
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium">{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xl">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search intentions"
          />
        </div>
      </div>

      {initialLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="ml-2 text-sm">Loading intentions...</span>
        </div>
      ) : filteredIntents.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No intentions found. Add a custom intent to get started.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredIntents.map((intent) => (
            <div key={intent._id || intent.value} className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <ListChecks className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{intent.value}</p>
                  <p className="text-sm text-muted-foreground">{intent.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title="Create intention"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Intent key</label>
            <Input
              value={formState.value}
              onChange={(event) => setFormState((prev) => ({ ...prev, value: event.target.value }))}
              placeholder="e.g., product_inquiry"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <textarea
              value={formState.description}
              onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Describe how to detect this intent"
              rows={5}
              className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-y"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={loading}>
              Save intention
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
