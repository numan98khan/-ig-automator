import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Loader2,
  RefreshCcw,
  Save,
  Sparkles,
  Star,
  Trash2,
  UserCircle2,
} from 'lucide-react';
import {
  AutomationInstance,
  AutomationPreviewEvent,
  AutomationPreviewMessage,
  AutomationPreviewPersona,
  AutomationPreviewProfile,
  AutomationPreviewSessionState,
  AutomationSimulationDiagnostic,
  AutomationSimulationSelection,
  automationAPI,
} from '../../services/api';
import { AutomationPreviewPhone } from './AutomationPreviewPhone';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

type AutomationsSimulateViewProps = {
  workspaceId?: string;
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  automations?: AutomationInstance[];
  canViewExecutionTimeline?: boolean;
};

const DEFAULT_PERSONA: AutomationPreviewPersona = {
  name: 'Mock Tester',
  handle: '',
  userId: '',
  avatarUrl: '',
};

const profileToPersona = (profile: AutomationPreviewProfile): AutomationPreviewPersona => ({
  name: profile.name || 'Mock Tester',
  handle: profile.handle || '',
  userId: profile.userId || '',
  avatarUrl: profile.avatarUrl || '',
});

const formatDiagnosticReason = (reason: string) => {
  const map: Record<string, string> = {
    template_archived: 'Template archived',
    missing_published_version: 'No published version',
    runtime_resolution_failed: 'Runtime invalid',
    no_triggers_defined: 'No triggers defined',
    trigger_type_mismatch: 'Trigger type mismatch',
    trigger_config_mismatch: 'Trigger config mismatch',
    keyword_bucket_mismatch: 'Keyword bucket mismatch',
    intent_bucket_mismatch: 'Intent bucket mismatch',
    unqualified_bucket_mismatch: 'Unqualified bucket mismatch',
    no_priority_bucket: 'Not eligible for priority buckets',
  };
  return map[reason] || reason.replace(/_/g, ' ');
};

const formatFieldValue = (value: any) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const EVENT_BADGES: Record<string, { label: string; variant: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  node_start: { label: 'Node start', variant: 'primary' },
  node_complete: { label: 'Node complete', variant: 'success' },
  field_update: { label: 'Field', variant: 'secondary' },
  field_clear: { label: 'Field', variant: 'warning' },
  tag_added: { label: 'Tag', variant: 'success' },
  tag_removed: { label: 'Tag', variant: 'warning' },
  error: { label: 'Error', variant: 'danger' },
  info: { label: 'Info', variant: 'neutral' },
};

const EVENT_FILTER_KEYS = Object.keys(EVENT_BADGES);

const buildDefaultEventFilters = () =>
  EVENT_FILTER_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {} as Record<string, boolean>);

const NODE_TYPE_BADGES: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
  send_message: { label: 'Send Message', badgeClass: 'bg-sky-500/10 text-sky-600', dotClass: 'bg-sky-500' },
  ai_reply: { label: 'AI Reply', badgeClass: 'bg-indigo-500/10 text-indigo-600', dotClass: 'bg-indigo-500' },
  ai_agent: { label: 'AI Agent', badgeClass: 'bg-violet-500/10 text-violet-600', dotClass: 'bg-violet-500' },
  detect_intent: { label: 'Detect Intent', badgeClass: 'bg-emerald-500/10 text-emerald-600', dotClass: 'bg-emerald-500' },
  handoff: { label: 'Handoff', badgeClass: 'bg-amber-500/10 text-amber-600', dotClass: 'bg-amber-500' },
  router: { label: 'Router', badgeClass: 'bg-cyan-500/10 text-cyan-600', dotClass: 'bg-cyan-500' },
};

const mergePreviewMessages = (
  existing: AutomationPreviewMessage[],
  incoming?: AutomationPreviewMessage[],
) => {
  if (!incoming) return existing;
  const seen = new Set(incoming.map((message) => message.id));
  const merged = [...incoming, ...existing.filter((message) => !seen.has(message.id))];
  if (merged.length > 1 && merged.every((message) => message.createdAt)) {
    return [...merged].sort((a, b) =>
      new Date(a.createdAt as string).getTime() - new Date(b.createdAt as string).getTime());
  }
  return merged;
};

export const AutomationsSimulateView: React.FC<AutomationsSimulateViewProps> = ({
  workspaceId,
  accountDisplayName,
  accountHandle,
  accountAvatarUrl,
  accountInitial,
  automations,
  canViewExecutionTimeline = false,
}) => {
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<AutomationPreviewMessage[]>([]);
  const [previewInputValue, setPreviewInputValue] = useState('');
  const [previewSessionStatus, setPreviewSessionStatus] = useState<
    'active' | 'paused' | 'completed' | 'handoff' | null
  >(null);
  const [previewSending, setPreviewSending] = useState(false);
  const [previewState, setPreviewState] = useState<AutomationPreviewSessionState>({
    session: null,
    conversation: null,
    currentNode: null,
    events: [],
    profile: null,
    persona: null,
  });

  const [selectedAutomation, setSelectedAutomation] = useState<AutomationSimulationSelection | null>(null);
  const [diagnostics, setDiagnostics] = useState<AutomationSimulationDiagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rightPaneTab, setRightPaneTab] = useState<'persona' | 'state' | 'timeline'>('persona');
  const [mobileView, setMobileView] = useState<'preview' | 'details'>('preview');

  const [profiles, setProfiles] = useState<AutomationPreviewProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [personaDraft, setPersonaDraft] = useState<AutomationPreviewPersona>(DEFAULT_PERSONA);
  const [profileBusy, setProfileBusy] = useState(false);
  const [eventFilters, setEventFilters] = useState<Record<string, boolean>>(buildDefaultEventFilters);
  const canViewTimeline = Boolean(canViewExecutionTimeline);
  const profileAutomationId = selectedAutomation?.id
    || automations?.find((automation) => automation.isActive)?._id
    || automations?.[0]?._id
    || undefined;

  const sessionStatus = previewSessionStatus || previewState.session?.status;
  const statusConfig = sessionStatus
    ? {
      active: { label: 'Running', variant: 'success' as const },
      paused: { label: 'Waiting', variant: 'warning' as const },
      completed: { label: 'Completed', variant: 'neutral' as const },
      handoff: { label: 'Waiting', variant: 'warning' as const },
    }[sessionStatus]
    : { label: 'Idle', variant: 'neutral' as const };

  const applyPreviewPayload = useCallback((payload: Partial<AutomationPreviewSessionState> & {
    sessionId?: string;
    status?: 'active' | 'paused' | 'completed' | 'handoff';
    messages?: AutomationPreviewMessage[];
  }) => {
    if (payload.sessionId) {
      setPreviewSessionId(payload.sessionId);
    } else if (payload.session?._id) {
      setPreviewSessionId(payload.session._id);
    }
    if (payload.messages) {
      setPreviewMessages((prev) => mergePreviewMessages(prev, payload.messages));
    }
    const nextStatus = payload.status || payload.session?.status;
    if (payload.status !== undefined || payload.session === null) {
      setPreviewSessionStatus(payload.status ?? null);
    } else if (nextStatus) {
      setPreviewSessionStatus(nextStatus);
    }
    setPreviewState((prev) => ({
      session: payload.session !== undefined ? payload.session : prev.session,
      conversation: payload.conversation !== undefined ? payload.conversation : prev.conversation,
      currentNode: payload.currentNode !== undefined ? payload.currentNode : prev.currentNode,
      events: payload.events !== undefined ? payload.events : prev.events,
      profile: payload.profile !== undefined ? payload.profile : prev.profile,
      persona: payload.persona !== undefined ? payload.persona : prev.persona,
    }));
  }, []);

  const loadProfiles = useCallback(async (automationId: string) => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const data = await automationAPI.listPreviewProfiles(automationId);
      setProfiles(data);
      return data;
    } catch (err) {
      console.error('Error loading preview profiles:', err);
      setProfilesError('Unable to load mock profiles.');
      return [];
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  const syncPersona = useCallback(async (params: {
    profileId?: string;
    persona?: AutomationPreviewPersona;
  }) => {
    if (!selectedAutomation?.id || !previewSessionId) return;
    try {
      const response = await automationAPI.updatePreviewPersona(selectedAutomation.id, {
        sessionId: previewSessionId,
        profileId: params.profileId,
        persona: params.persona,
      });
      applyPreviewPayload(response);
    } catch (err) {
      console.error('Error syncing preview persona:', err);
      setProfilesError('Failed to apply mock persona.');
    }
  }, [applyPreviewPayload, previewSessionId, selectedAutomation?.id]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (!profileAutomationId) {
        setProfiles([]);
        setSelectedProfileId(null);
        setProfilesError('Add an automation to manage mock profiles.');
        return;
      }
      const loadedProfiles = await loadProfiles(profileAutomationId);
      if (!active) return;

      const selected = selectedProfileId
        ? loadedProfiles.find((profile) => profile._id === selectedProfileId)
        : null;
      if (selected) return;

      const defaultProfile = loadedProfiles.find((profile) => profile.isDefault) || loadedProfiles[0] || null;
      if (defaultProfile) {
        setSelectedProfileId(defaultProfile._id);
        setPersonaDraft(profileToPersona(defaultProfile));
      } else {
        setSelectedProfileId(null);
        setPersonaDraft(DEFAULT_PERSONA);
      }
    };

    init();

    return () => {
      active = false;
    };
  }, [loadProfiles, profileAutomationId, selectedProfileId]);

  useEffect(() => {
    if (!canViewTimeline && rightPaneTab === 'timeline') {
      setRightPaneTab('persona');
    }
  }, [canViewTimeline, rightPaneTab]);

  useEffect(() => {
    setPreviewMessages([]);
    setPreviewSessionId(null);
    setPreviewSessionStatus(null);
    setPreviewState({
      session: null,
      conversation: null,
      currentNode: null,
      events: [],
      profile: null,
      persona: null,
    });
    setSelectedAutomation(null);
    setDiagnostics([]);
    setError(null);
  }, [workspaceId]);

  const handlePreviewInputChange = (value: string) => {
    setPreviewInputValue(value);
    if (error) setError(null);
  };

  const handleReset = () => {
    setPreviewMessages([]);
    setPreviewSessionId(null);
    setPreviewSessionStatus(null);
    setPreviewState({
      session: null,
      conversation: null,
      currentNode: null,
      events: [],
      profile: null,
      persona: null,
    });
    setSelectedAutomation(null);
    setDiagnostics([]);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = previewInputValue.trim();
    if (!trimmed || !workspaceId) return;

    setError(null);
    setPreviewSending(true);
    const optimisticMessage: AutomationPreviewMessage = {
      id: `sim-${Date.now()}`,
      from: 'customer',
      text: trimmed,
    };
    setPreviewMessages((prev) => [...prev, optimisticMessage]);
    setPreviewInputValue('');

    try {
      const response = await automationAPI.simulateMessage({
        workspaceId,
        text: trimmed,
        sessionId: previewSessionId || undefined,
        profileId: selectedProfileId || undefined,
        persona: selectedProfileId ? undefined : personaDraft,
      });
      const { messages, ...rest } = response;
      applyPreviewPayload(rest);
      setSelectedAutomation(response.selectedAutomation || null);
      setDiagnostics(response.diagnostics || []);
      if (messages && messages.length > 0) {
        setPreviewMessages((prev) => [...prev, ...messages]);
      }
      if (!response.success) {
        setError(response.error || 'No automation matched this message.');
      }
    } catch (err) {
      console.error('Simulator message error:', err);
      setError('Failed to send simulation message.');
    } finally {
      setPreviewSending(false);
    }
  };

  const handleSelectProfile = async (value: string) => {
    if (value === 'custom') {
      setSelectedProfileId(null);
      setPersonaDraft(DEFAULT_PERSONA);
      await syncPersona({ persona: DEFAULT_PERSONA });
      return;
    }
    const profile = profiles.find((item) => item._id === value);
    if (!profile) return;
    setSelectedProfileId(profile._id);
    setPersonaDraft(profileToPersona(profile));
    await syncPersona({ profileId: profile._id });
  };

  const handleSaveProfile = async () => {
    if (profileBusy || !profileAutomationId) return;
    setProfileBusy(true);
    try {
      let savedProfile: AutomationPreviewProfile;
      if (selectedProfileId) {
        savedProfile = await automationAPI.updatePreviewProfile(profileAutomationId, selectedProfileId, {
          name: personaDraft.name,
          handle: personaDraft.handle || undefined,
          userId: personaDraft.userId || undefined,
          avatarUrl: personaDraft.avatarUrl,
        });
      } else {
        savedProfile = await automationAPI.createPreviewProfile(profileAutomationId, {
          name: personaDraft.name,
          handle: personaDraft.handle || undefined,
          userId: personaDraft.userId || undefined,
          avatarUrl: personaDraft.avatarUrl,
        });
      }
      const updatedProfiles = await loadProfiles(profileAutomationId);
      setProfiles(updatedProfiles);
      setSelectedProfileId(savedProfile._id);
      setPersonaDraft(profileToPersona(savedProfile));
      await syncPersona({ profileId: savedProfile._id });
    } catch (err) {
      console.error('Error saving preview profile:', err);
      setProfilesError('Unable to save mock profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleDuplicateProfile = async () => {
    if (!selectedProfileId || profileBusy || !profileAutomationId) return;
    setProfileBusy(true);
    try {
      const duplicated = await automationAPI.duplicatePreviewProfile(profileAutomationId, selectedProfileId);
      const updatedProfiles = await loadProfiles(profileAutomationId);
      setProfiles(updatedProfiles);
      setSelectedProfileId(duplicated._id);
      setPersonaDraft(profileToPersona(duplicated));
      await syncPersona({ profileId: duplicated._id });
    } catch (err) {
      console.error('Error duplicating preview profile:', err);
      setProfilesError('Unable to duplicate mock profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileId || profileBusy || !profileAutomationId) return;
    if (!confirm('Delete this mock profile?')) return;
    setProfileBusy(true);
    try {
      await automationAPI.deletePreviewProfile(profileAutomationId, selectedProfileId);
      const updatedProfiles = await loadProfiles(profileAutomationId);
      setProfiles(updatedProfiles);
      const fallback = updatedProfiles.find((profile) => profile.isDefault) || updatedProfiles[0] || null;
      if (fallback) {
        setSelectedProfileId(fallback._id);
        setPersonaDraft(profileToPersona(fallback));
        await syncPersona({ profileId: fallback._id });
      } else {
        setSelectedProfileId(null);
        setPersonaDraft(DEFAULT_PERSONA);
        await syncPersona({ persona: DEFAULT_PERSONA });
      }
    } catch (err) {
      console.error('Error deleting preview profile:', err);
      setProfilesError('Unable to delete mock profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSetDefaultProfile = async () => {
    if (!selectedProfileId || profileBusy || !profileAutomationId) return;
    setProfileBusy(true);
    try {
      await automationAPI.setDefaultPreviewProfile(profileAutomationId, selectedProfileId);
      const updatedProfiles = await loadProfiles(profileAutomationId);
      setProfiles(updatedProfiles);
    } catch (err) {
      console.error('Error setting default preview profile:', err);
      setProfilesError('Unable to set default profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setPersonaDraft((prev) => ({ ...prev, avatarUrl: result }));
    };
    reader.readAsDataURL(file);
  };

  const handleClearAvatar = () => {
    setPersonaDraft((prev) => ({ ...prev, avatarUrl: '' }));
  };

  const activeLabel = selectedAutomation?.name || 'No automation selected';
  const triggerLabel = selectedAutomation?.trigger?.label || selectedAutomation?.trigger?.type;
  const diagnosticList = useMemo(() => diagnostics.slice(0, 6), [diagnostics]);
  const personaInitials = (personaDraft.name || 'MT').slice(0, 2).toUpperCase();
  const fieldEntries = useMemo(() => {
    const vars = previewState.session?.state?.vars || {};
    return Object.entries(vars)
      .filter(([key]) => !key.startsWith('agent'))
      .map(([key, value]) => ({ key, value: formatFieldValue(value) }));
  }, [previewState.session?.state?.vars]);
  const agentSlotEntries = useMemo(() => {
    const slots = previewState.session?.state?.vars?.agentSlots;
    if (!slots || typeof slots !== 'object') return [];
    return Object.entries(slots).map(([key, value]) => ({ key, value: formatFieldValue(value) }));
  }, [previewState.session?.state?.vars?.agentSlots]);
  const agentMissingSlots = useMemo(() => {
    const missing = previewState.session?.state?.vars?.agentMissingSlots;
    if (!missing) return [];
    return Array.isArray(missing) ? missing.filter(Boolean) : [];
  }, [previewState.session?.state?.vars?.agentMissingSlots]);
  const tags = previewState.conversation?.tags || [];
  const events: AutomationPreviewEvent[] = previewState.events || [];
  const filteredEvents = events.filter((event) => eventFilters[event.type] ?? true);

  const sendDisabled =
    previewSending ||
    previewInputValue.trim().length === 0;

  const renderTestConsole = () => (
    <Card className="flex flex-col min-h-0 h-full">
      <CardHeader className="grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="flex flex-wrap items-center gap-2 sm:justify-start">
          <Badge variant="neutral" className="hidden sm:inline-flex">Preview</Badge>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCcw className="w-4 h-4" />}
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
        <div className="hidden sm:block" />
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden pt-6">
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="h-full max-h-full aspect-[9/19.5] w-auto max-w-full min-h-0">
            <AutomationPreviewPhone
              accountDisplayName={accountDisplayName}
              accountHandle={accountHandle}
              accountAvatarUrl={accountAvatarUrl}
              accountInitial={accountInitial}
              messages={previewMessages}
              showSeen={previewMessages.length > 0 && previewMessages[previewMessages.length - 1].from === 'ai'}
              mode="interactive"
              inputValue={previewInputValue}
              onInputChange={handlePreviewInputChange}
              onSubmit={handleSubmit}
              inputDisabled={false}
              sendDisabled={sendDisabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderPersonaCard = () => (
    <Card className="flex flex-col min-h-0 flex-1 w-full">
      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto pt-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-14 w-14 rounded-full overflow-hidden bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground">
            {personaDraft.avatarUrl ? (
              <img src={personaDraft.avatarUrl} alt={personaDraft.name} className="h-full w-full object-cover" />
            ) : (
              personaInitials
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Avatar</span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  Upload
                </span>
              </label>
              <button
                type="button"
                onClick={handleClearAvatar}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Display name"
            value={personaDraft.name}
            onChange={(event) => setPersonaDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
          <Input
            label="Mock IG handle"
            value={personaDraft.handle}
            onChange={(event) => setPersonaDraft((prev) => ({ ...prev, handle: event.target.value }))}
          />
          <Input
            label="Mock user ID"
            value={personaDraft.userId}
            onChange={(event) => setPersonaDraft((prev) => ({ ...prev, userId: event.target.value }))}
          />
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Saved profiles</span>
            <div className="flex items-center gap-2 text-xs">
              {profilesLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {profilesError && <span className="text-destructive">{profilesError}</span>}
            </div>
          </div>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={selectedProfileId || 'custom'}
            onChange={(event) => void handleSelectProfile(event.target.value)}
            disabled={!profileAutomationId}
          >
            <option value="custom">Custom (unsaved)</option>
            {profiles.map((profile) => (
              <option key={profile._id} value={profile._id}>
                {profile.name}{profile.isDefault ? ' (Default)' : ''}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<UserCircle2 className="w-4 h-4" />}
              onClick={() => {
                setSelectedProfileId(null);
                setPersonaDraft(DEFAULT_PERSONA);
                void syncPersona({ persona: DEFAULT_PERSONA });
              }}
              disabled={!profileAutomationId}
            >
              New
            </Button>
            <Button
              size="sm"
              leftIcon={<Save className="w-4 h-4" />}
              onClick={handleSaveProfile}
              isLoading={profileBusy}
              disabled={!profileAutomationId}
            >
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Copy className="w-4 h-4" />}
              onClick={handleDuplicateProfile}
              disabled={!selectedProfileId || profileBusy || !profileAutomationId}
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Star className="w-4 h-4" />}
              onClick={handleSetDefaultProfile}
              disabled={!selectedProfileId || profileBusy || !profileAutomationId}
            >
              Set default
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={handleDeleteProfile}
              disabled={!selectedProfileId || profileBusy || !profileAutomationId}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderStateCard = () => (
    <Card className="flex flex-col min-h-0 flex-1 w-full">
      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto pt-6">
        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Matched automation</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{activeLabel}</div>
          {triggerLabel && (
            <div className="text-xs text-muted-foreground">Trigger: {triggerLabel}</div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Evaluation</div>
          {diagnosticList.length > 0 ? (
            <div className="mt-2 space-y-2">
              {diagnosticList.map((entry) => (
                <div key={`${entry.instanceId}-${entry.reason}`} className="text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{entry.name || 'Untitled automation'}</div>
                  <div>{formatDiagnosticReason(entry.reason)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">No evaluation details yet.</div>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Current step</div>
          {previewState.currentNode ? (() => {
            const nodeTypeKey = previewState.currentNode.type?.toLowerCase() || '';
            const nodeMeta = NODE_TYPE_BADGES[nodeTypeKey];
            const nodeLabel = previewState.currentNode.label || previewState.currentNode.id || 'Active node';
            const nodeTypeLabel = nodeMeta?.label || previewState.currentNode.type?.replace(/_/g, ' ') || 'Step';
            const badgeClass = nodeMeta?.badgeClass || 'bg-muted/60 text-muted-foreground';
            const dotClass = nodeMeta?.dotClass || 'bg-muted-foreground';
            return (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                  <div className="text-sm font-semibold truncate">{nodeLabel}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${badgeClass}`}>
                  {nodeTypeLabel}
                </span>
              </div>
            );
          })() : (
            <div className="mt-2 text-xs text-muted-foreground">Waiting for the next trigger.</div>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">AI slots</div>
          {agentSlotEntries.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {agentSlotEntries.map((slot) => (
                <div key={slot.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{slot.key}</span>
                  <span className="font-medium text-right">{slot.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">No AI slots collected yet.</div>
          )}
          {agentMissingSlots.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              Missing slots: <span className="font-medium text-foreground">{agentMissingSlots.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Collected fields</div>
          {fieldEntries.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {fieldEntries.map((field) => (
                <div key={field.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{field.key}</span>
                  <span className="font-medium text-right">{field.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">No fields collected yet.</div>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Tags</div>
          {tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">No tags applied yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderTimelineCard = () => (
    <Card className="flex flex-col min-h-0 flex-1 w-full">
      <CardContent className="flex-1 min-h-0 overflow-y-auto pt-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setEventFilters(buildDefaultEventFilters())}
            className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setEventFilters(EVENT_FILTER_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<string, boolean>))}
            className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            None
          </button>
          {EVENT_FILTER_KEYS.map((key) => {
            const badge = EVENT_BADGES[key];
            const active = eventFilters[key] !== false;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setEventFilters((prev) => ({ ...prev, [key]: !active }))}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {badge?.label || key}
              </button>
            );
          })}
        </div>
        {filteredEvents.length > 0 ? (
          <div className="space-y-3 pr-1">
            {filteredEvents.map((event) => {
              const badge = EVENT_BADGES[event.type] || EVENT_BADGES.info;
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <div className="flex-1">
                    <div className="text-sm">{event.message}</div>
                    <div className="text-xs text-muted-foreground">{formatTime(event.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : events.length > 0 ? (
          <div className="text-xs text-muted-foreground">No events match the selected filters.</div>
        ) : (
          <div className="text-xs text-muted-foreground">No events yet.</div>
        )}
      </CardContent>
    </Card>
  );

  const renderRightPane = () => (
    <div className="flex flex-col gap-4 min-h-0 h-full w-full">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2 py-1 w-full">
        {([
          { id: 'persona', label: 'Mock Persona' },
          { id: 'state', label: 'Automation State' },
          ...(canViewTimeline ? [{ id: 'timeline', label: 'Execution Timeline' }] : []),
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setRightPaneTab(tab.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              rightPaneTab === tab.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {rightPaneTab === 'persona'
        ? renderPersonaCard()
        : rightPaneTab === 'timeline'
          ? renderTimelineCard()
          : renderStateCard()}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <span className="font-medium text-foreground">Simulate</span>
          <Badge variant={statusConfig.variant} className="ml-1">
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          Realistic inbound automation simulator
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2 py-1 sm:hidden">
        {([
          { id: 'preview', label: 'Test Preview' },
          { id: 'details', label: 'Automation State' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileView(tab.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              mobileView === tab.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] grid-rows-[minmax(0,1fr)] flex-1 min-h-0 overflow-hidden">
        <div className={`${mobileView === 'preview' ? 'block' : 'hidden'} sm:block h-full min-h-0 min-w-0`}>
          {renderTestConsole()}
        </div>
        <div className={`${mobileView === 'details' ? 'flex' : 'hidden'} sm:flex h-full min-h-0 min-w-0`}>
          {renderRightPane()}
        </div>
      </div>
    </div>
  );
};
