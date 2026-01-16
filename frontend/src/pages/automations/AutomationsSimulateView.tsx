import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  RefreshCcw,
  Sparkles,
} from 'lucide-react';
import {
  AutomationInstance,
  AutomationPreviewMessage,
  AutomationPreviewPersona,
  AutomationPreviewProfile,
  AutomationPreviewSessionState,
  AutomationSimulationDiagnostic,
  AutomationSimulationSelection,
  automationAPI,
} from '../../services/api';
import { AutomationPreviewPhone } from './AutomationPreviewPhone';
import {
  AutomationPreviewPersonaPanel,
  AutomationPreviewStatePanel,
  AutomationPreviewTimelinePanel,
  mergePreviewEvents,
} from './AutomationPreviewPanels';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';

type AutomationsSimulateViewProps = {
  workspaceId?: string;
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  automations?: AutomationInstance[];
  canViewExecutionTimeline?: boolean;
};

type RightPaneTab = 'persona' | 'state' | 'timeline';

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

const mergePreviewMessages = (
  existing: AutomationPreviewMessage[],
  incoming?: AutomationPreviewMessage[],
) => {
  if (!incoming || incoming.length === 0) return existing;
  const optimisticPrefix = 'sim-';
  const optimisticWindowMs = 4000;
  const isOptimistic = (message: AutomationPreviewMessage) => message.id?.startsWith(optimisticPrefix);
  const isLikelyDuplicate = (optimistic: AutomationPreviewMessage, candidate: AutomationPreviewMessage) => {
    if (optimistic.from !== 'customer' || candidate.from !== 'customer') return false;
    if (optimistic.text !== candidate.text) return false;
    if (isOptimistic(candidate)) return false;
    if (!optimistic.createdAt || !candidate.createdAt) return false;
    const optimisticTime = new Date(optimistic.createdAt).getTime();
    const candidateTime = new Date(candidate.createdAt).getTime();
    return Math.abs(optimisticTime - candidateTime) <= optimisticWindowMs;
  };
  let tempCounter = 0;
  const order: string[] = [];
  const items = new Map<string, AutomationPreviewMessage>();
  const upsert = (message: AutomationPreviewMessage) => {
    const key = message.id || `tmp-${tempCounter++}`;
    if (!items.has(key)) {
      order.push(key);
    }
    items.set(key, message);
  };
  existing.forEach(upsert);
  incoming.forEach(upsert);
  const merged = order.map((key) => items.get(key)).filter(Boolean) as AutomationPreviewMessage[];
  const deduped = merged.filter((message) => {
    if (!isOptimistic(message) || message.from !== 'customer') {
      return true;
    }
    return !merged.some((candidate) => isLikelyDuplicate(message, candidate));
  });
  if (deduped.length <= 1) return deduped;
  const decorated = deduped.map((message, index) => ({
    message,
    index,
    timestamp: message.createdAt ? new Date(message.createdAt as string).getTime() : null,
    key: message.id || `idx-${index}`,
  }));
  decorated.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    if (a.timestamp !== null && b.timestamp === null) return -1;
    if (a.timestamp === null && b.timestamp !== null) return 1;
    if (a.key !== b.key) return a.key.localeCompare(b.key);
    return a.index - b.index;
  });
  return decorated.map((entry) => entry.message);
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
  const [rightPaneTab, setRightPaneTab] = useState<RightPaneTab>('persona');
  const [mobileView, setMobileView] = useState<'preview' | 'details'>('preview');

  const [profiles, setProfiles] = useState<AutomationPreviewProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [personaDraft, setPersonaDraft] = useState<AutomationPreviewPersona>(DEFAULT_PERSONA);
  const [profileBusy, setProfileBusy] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
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
      events: mergePreviewEvents(prev.events || [], payload.events),
      profile: payload.profile !== undefined ? payload.profile : prev.profile,
      persona: payload.persona !== undefined ? payload.persona : prev.persona,
    }));
  }, []);

  const loadPersistedSimulation = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const response = await automationAPI.getSimulationSession(workspaceId);
      if (!response.session) return;
      applyPreviewPayload({ ...response, messages: response.messages });
      setSelectedAutomation(response.selectedAutomation || null);
      setDiagnostics(response.diagnostics || []);
      if (response.profile?._id) {
        setSelectedProfileId(response.profile._id);
        setPersonaDraft(profileToPersona(response.profile));
      } else if (response.persona) {
        setSelectedProfileId(null);
        setPersonaDraft(response.persona);
      }
      setResetPending(false);
    } catch (err) {
      console.error('Failed to load simulation session:', err);
    }
  }, [applyPreviewPayload, workspaceId]);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleSimulationRefresh = useCallback((baselineIds: Set<string>, remainingAttempts = 15) => {
    if (!workspaceId || remainingAttempts <= 0) {
      clearRefreshTimer();
      return;
    }
    refreshTimerRef.current = window.setTimeout(async () => {
      try {
        const response = await automationAPI.getSimulationSession(workspaceId);
        applyPreviewPayload({ ...response, messages: response.messages });
        if (response.selectedAutomation) {
          setSelectedAutomation(response.selectedAutomation);
        }
        const hasNewAiMessage = (response.messages || []).some((message) =>
          message.from === 'ai' && message.id && !baselineIds.has(message.id));
        if (hasNewAiMessage) {
          clearRefreshTimer();
          return;
        }
      } catch (err) {
        console.error('Failed to refresh simulation session:', err);
      }
      scheduleSimulationRefresh(baselineIds, remainingAttempts - 1);
    }, 1000);
  }, [applyPreviewPayload, clearRefreshTimer, workspaceId]);

  useEffect(() => () => {
    clearRefreshTimer();
  }, [clearRefreshTimer]);

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
    setResetPending(false);
    clearRefreshTimer();
  }, [clearRefreshTimer, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    void loadPersistedSimulation();
  }, [loadPersistedSimulation, workspaceId]);

  const handlePreviewInputChange = (value: string) => {
    setPreviewInputValue(value);
    if (error) setError(null);
  };

  const handleReset = async () => {
    clearRefreshTimer();
    if (workspaceId) {
      try {
        await automationAPI.resetSimulationSession({
          workspaceId,
          sessionId: previewSessionId || undefined,
        });
      } catch (err) {
        console.error('Failed to reset simulation session:', err);
      }
    }
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
    setResetPending(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = previewInputValue.trim();
    if (!trimmed || !workspaceId) return;

    clearRefreshTimer();
    setError(null);
    const baselineIds = new Set(previewMessages.map((message) => message.id).filter(Boolean));
    const clientSentAt = new Date().toISOString();
    const optimisticMessage: AutomationPreviewMessage = {
      id: `sim-${Date.now()}`,
      from: 'customer',
      text: trimmed,
      createdAt: clientSentAt,
    };
    setPreviewMessages((prev) => [...prev, optimisticMessage]);
    setPreviewInputValue('');

    const resetRequested = resetPending;
    try {
      const response = await automationAPI.simulateMessage({
        workspaceId,
        text: trimmed,
        sessionId: resetRequested ? undefined : previewSessionId || undefined,
        reset: resetRequested,
        profileId: selectedProfileId || undefined,
        persona: selectedProfileId ? undefined : personaDraft,
        clientSentAt,
      });
      const { messages, ...rest } = response;
      applyPreviewPayload(rest);
      setSelectedAutomation(response.selectedAutomation || null);
      setDiagnostics(response.diagnostics || []);
      setResetPending(false);
      if (messages) {
        setPreviewMessages((prev) => mergePreviewMessages(prev, messages));
      }
      const hasNewAiMessage = (messages || []).some((message) =>
        message.from === 'ai' && message.id && !baselineIds.has(message.id));
      if (!hasNewAiMessage) {
        scheduleSimulationRefresh(baselineIds);
      }
      if (!response.success) {
        setError(response.error || 'No automation matched this message.');
      }
    } catch (err) {
      console.error('Simulator message error:', err);
      setError('Failed to send simulation message.');
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

  const activeLabel = selectedAutomation?.name || 'No automation selected';
  const triggerLabel = selectedAutomation?.trigger?.label || selectedAutomation?.trigger?.type;
  const diagnosticList = useMemo(() => diagnostics.slice(0, 6), [diagnostics]);

  const sendDisabled = previewInputValue.trim().length === 0;

  const renderTestConsole = () => (
    <Card className="flex flex-col min-h-0 h-full">
      <CardHeader className="hidden sm:grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
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
      <CardContent className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden pt-4 sm:pt-6">
        <div className="flex items-center justify-end sm:hidden">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCcw className="w-4 h-4" />}
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
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

  const statePrepend = (
    <>
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
    </>
  );

  const renderRightPane = () => (
    <div className="flex flex-col gap-4 min-h-0 h-full w-full">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2 py-1 w-full">
        {(() => {
          const tabs: Array<{ id: RightPaneTab; label: string }> = [
            { id: 'persona', label: 'Mock Persona' },
            { id: 'state', label: 'Automation State' },
          ];
          if (canViewTimeline) {
            tabs.push({ id: 'timeline', label: 'Execution Timeline' });
          }
          return tabs;
        })().map((tab) => (
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
      {rightPaneTab === 'persona' ? (
        <AutomationPreviewPersonaPanel
          persona={personaDraft}
          profiles={profiles}
          profilesLoading={profilesLoading}
          profilesError={profilesError}
          selectedProfileId={selectedProfileId}
          profileBusy={profileBusy}
          actionsDisabled={!profileAutomationId}
          onSelectProfile={handleSelectProfile}
          onNewProfile={() => {
            setSelectedProfileId(null);
            setPersonaDraft(DEFAULT_PERSONA);
            void syncPersona({ persona: DEFAULT_PERSONA });
          }}
          onSaveProfile={handleSaveProfile}
          onDuplicateProfile={handleDuplicateProfile}
          onSetDefaultProfile={handleSetDefaultProfile}
          onDeleteProfile={handleDeleteProfile}
          onPersonaChange={setPersonaDraft}
        />
      ) : rightPaneTab === 'timeline' ? (
        <AutomationPreviewTimelinePanel events={previewState.events || []} />
      ) : (
        <AutomationPreviewStatePanel
          currentNode={previewState.currentNode}
          session={previewState.session}
          conversation={previewState.conversation}
          messages={previewMessages}
          showConversationHistory
          canViewHistory={canViewTimeline}
          prepend={statePrepend}
        />
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 gap-3 sm:gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between flex-shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <span className="font-medium text-foreground">Simulate</span>
          <Badge variant={statusConfig.variant} className="ml-1">
            {statusConfig.label}
          </Badge>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          Realistic inbound automation simulator
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-1.5 py-1 sm:hidden">
        {([
          { id: 'preview', label: 'Test Preview' },
          { id: 'details', label: 'Automation State' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileView(tab.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
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
