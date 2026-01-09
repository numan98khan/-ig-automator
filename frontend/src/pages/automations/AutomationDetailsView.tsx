import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  PauseCircle,
  RefreshCcw,
  StopCircle,
} from 'lucide-react';
import {
  AutomationInstance,
  AutomationPreviewMessage,
  AutomationPreviewPersona,
  AutomationPreviewProfile,
  AutomationPreviewSessionState,
  automationAPI,
} from '../../services/api';
import { AutomationPreviewPhone } from './AutomationPreviewPhone';
import {
  AutomationPreviewPersonaPanel,
  AutomationPreviewStatePanel,
  AutomationPreviewTimelinePanel,
  mergePreviewEvents,
} from './AutomationPreviewPanels';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

type AutomationDetailsViewProps = {
  automation: AutomationInstance;
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  canViewExecutionTimeline?: boolean;
  onBack: () => void;
  onEdit: (automation: AutomationInstance) => void;
  embedded?: boolean;
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

export const AutomationDetailsView: React.FC<AutomationDetailsViewProps> = ({
  automation,
  accountDisplayName,
  accountHandle,
  accountAvatarUrl,
  accountInitial,
  canViewExecutionTimeline = false,
  onBack,
  onEdit,
  embedded = false,
}) => {
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<AutomationPreviewMessage[]>([]);
  const [previewInputValue, setPreviewInputValue] = useState('');
  const [previewToast, setPreviewToast] = useState<{ status: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [previewSessionStatus, setPreviewSessionStatus] = useState<
    'active' | 'paused' | 'completed' | 'handoff' | null
  >(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSending, setPreviewSending] = useState(false);
  const [previewState, setPreviewState] = useState<AutomationPreviewSessionState>({
    session: null,
    conversation: null,
    currentNode: null,
    events: [],
    profile: null,
    persona: null,
  });

  const [profiles, setProfiles] = useState<AutomationPreviewProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [personaDraft, setPersonaDraft] = useState<AutomationPreviewPersona>(DEFAULT_PERSONA);
  const [profileBusy, setProfileBusy] = useState(false);
  const [rightPaneTab, setRightPaneTab] = useState<'persona' | 'state' | 'timeline'>('persona');
  const [isTyping, setIsTyping] = useState(false);
  const [mobileView, setMobileView] = useState<'preview' | 'details'>('preview');
  const previewSessionIdRef = useRef<string | null>(null);
  const previewToastTimerRef = useRef<number | null>(null);
  const canViewTimeline = Boolean(canViewExecutionTimeline);

  const clearPreviewToast = useCallback(() => {
    if (previewToastTimerRef.current) {
      window.clearTimeout(previewToastTimerRef.current);
      previewToastTimerRef.current = null;
    }
    setPreviewToast(null);
  }, []);

  const pushPreviewToast = useCallback((status: 'success' | 'error' | 'info', message: string) => {
    setPreviewToast({ status, message });
    if (previewToastTimerRef.current) {
      window.clearTimeout(previewToastTimerRef.current);
    }
    previewToastTimerRef.current = window.setTimeout(() => {
      setPreviewToast(null);
      previewToastTimerRef.current = null;
    }, 2200);
  }, []);

  const sessionStatus = previewSessionStatus || previewState.session?.status;
  const statusConfig = sessionStatus
    ? {
      active: { label: 'Running', variant: 'success' as const },
      paused: { label: 'Waiting', variant: 'warning' as const },
      completed: { label: 'Completed', variant: 'neutral' as const },
      handoff: { label: 'Waiting', variant: 'warning' as const },
    }[sessionStatus]
    : { label: 'Idle', variant: 'neutral' as const };

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
    if (nextStatus) {
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

  const startPreviewSession = useCallback(async (options?: {
    reset?: boolean;
    profileId?: string;
    persona?: AutomationPreviewPersona;
    sessionId?: string | null;
  }) => {
    setPreviewLoading(true);
    clearPreviewToast();
    try {
      const response = await automationAPI.createPreviewSession(automation._id, {
        reset: options?.reset,
        profileId: options?.profileId,
        persona: options?.persona,
        sessionId: options?.sessionId ?? previewSessionIdRef.current ?? undefined,
      });
      applyPreviewPayload(response);
    } catch (err) {
      console.error('Error starting preview session:', err);
      pushPreviewToast('error', 'Unable to start preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  }, [automation._id, applyPreviewPayload, clearPreviewToast, pushPreviewToast]);

  const refreshPreviewState = useCallback(async () => {
    if (!automation._id) return;
    if (isTyping || previewSending) return;
    try {
      const response = await automationAPI.getPreviewSessionStatus(automation._id, previewSessionId || undefined);
      applyPreviewPayload(response);
    } catch (err) {
      console.error('Error refreshing preview state:', err);
    }
  }, [automation._id, applyPreviewPayload, isTyping, previewSending, previewSessionId]);

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true);
    setProfilesError(null);
    try {
      const data = await automationAPI.listPreviewProfiles(automation._id);
      setProfiles(data);
      return data;
    } catch (err) {
      console.error('Error loading preview profiles:', err);
      setProfilesError('Unable to load mock profiles.');
      return [];
    } finally {
      setProfilesLoading(false);
    }
  }, [automation._id]);

  const syncPersona = useCallback(async (params: {
    profileId?: string;
    persona?: AutomationPreviewPersona;
  }) => {
    if (!automation._id) return;
    try {
      if (previewSessionId) {
        const response = await automationAPI.updatePreviewPersona(automation._id, {
          sessionId: previewSessionId,
          profileId: params.profileId,
          persona: params.persona,
        });
        applyPreviewPayload(response);
      } else {
        await startPreviewSession({ profileId: params.profileId, persona: params.persona });
      }
    } catch (err) {
      console.error('Error syncing preview persona:', err);
      pushPreviewToast('error', 'Failed to apply mock persona.');
    }
  }, [automation._id, previewSessionId, applyPreviewPayload, pushPreviewToast, startPreviewSession]);

  useEffect(() => {
    previewSessionIdRef.current = previewSessionId;
  }, [previewSessionId]);

  useEffect(() => () => {
    if (previewToastTimerRef.current) {
      window.clearTimeout(previewToastTimerRef.current);
      previewToastTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setPreviewSessionId(null);
      setPreviewMessages([]);
      setPreviewInputValue('');
      clearPreviewToast();
      setPreviewSessionStatus(null);
      setPreviewState({
        session: null,
        conversation: null,
        currentNode: null,
        events: [],
        profile: null,
        persona: null,
      });
      const loadedProfiles = await loadProfiles();
      if (!active) return;
      const defaultProfile = loadedProfiles.find((profile) => profile.isDefault) || loadedProfiles[0] || null;
      if (defaultProfile) {
        setSelectedProfileId(defaultProfile._id);
        setPersonaDraft(profileToPersona(defaultProfile));
        await startPreviewSession({ profileId: defaultProfile._id });
      } else {
        setSelectedProfileId(null);
        setPersonaDraft(DEFAULT_PERSONA);
        await startPreviewSession({ persona: DEFAULT_PERSONA });
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [automation._id, clearPreviewToast, loadProfiles, startPreviewSession]);

  useEffect(() => {
    if (!canViewTimeline && rightPaneTab === 'timeline') {
      setRightPaneTab('persona');
    }
  }, [canViewTimeline, rightPaneTab]);

  const previewStateSessionId = previewState.session?._id;

  useEffect(() => {
    if (!previewSessionId) return;
    if (previewStateSessionId === previewSessionId) return;
    void refreshPreviewState();
  }, [previewSessionId, previewStateSessionId, refreshPreviewState]);

  const handlePreviewInputChange = (value: string) => {
    setPreviewInputValue(value);
    if (previewToast) clearPreviewToast();
  };

  const handlePreviewSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sessionStatus === 'paused') {
      pushPreviewToast('info', 'Preview is paused. Resume or reset to continue.');
      return;
    }
    if (sessionStatus === 'completed') {
      pushPreviewToast('info', 'Preview is stopped. Reset to start a new run.');
      return;
    }
    const trimmed = previewInputValue.trim();
    if (!trimmed) return;

    const optimisticMessage: AutomationPreviewMessage = {
      id: `preview-user-${Date.now()}`,
      from: 'customer',
      text: trimmed,
    };
    setPreviewMessages((prev) => [...prev, optimisticMessage]);
    setPreviewInputValue('');
    setPreviewSending(true);
    clearPreviewToast();

    try {
      const response = await automationAPI.sendPreviewMessage(automation._id, {
        text: trimmed,
        sessionId: previewSessionId || undefined,
        persona: selectedProfileId ? undefined : personaDraft,
      });
      if (response.sessionId && response.sessionId !== previewSessionId) {
        setPreviewSessionId(response.sessionId);
      }
      const { messages, ...rest } = response;
      applyPreviewPayload(rest);
      if (messages && messages.length > 0) {
        setPreviewMessages((prev) => [...prev, ...messages]);
      }
      if (!response.success) {
        pushPreviewToast('error', response.error || 'No automated response was generated.');
      }
    } catch (err) {
      console.error('Error sending preview message:', err);
      pushPreviewToast('error', 'Failed to send preview message.');
    } finally {
      setPreviewSending(false);
    }
  };

  const handlePreviewPause = async () => {
    if (!previewSessionId) return;
    try {
      setPreviewLoading(true);
      const response = await automationAPI.pausePreviewSession(automation._id, {
        sessionId: previewSessionId,
        reason: 'Paused from preview console',
      });
      if (response.session) {
        applyPreviewPayload({ session: response.session, status: response.session.status });
      }
      pushPreviewToast('info', 'Preview paused.');
    } catch (err) {
      console.error('Error pausing preview session:', err);
      pushPreviewToast('error', 'Failed to pause preview session.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewStop = async () => {
    if (!previewSessionId) return;
    try {
      setPreviewLoading(true);
      const response = await automationAPI.stopPreviewSession(automation._id, {
        sessionId: previewSessionId,
        reason: 'Stopped from preview console',
      });
      if (response.session) {
        applyPreviewPayload({ session: response.session, status: response.session.status });
      }
      pushPreviewToast('success', 'Preview stopped.');
    } catch (err) {
      console.error('Error stopping preview session:', err);
      pushPreviewToast('error', 'Failed to stop preview session.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewReset = async () => {
    setPreviewState((prev) => ({ ...prev, events: [] }));
    await startPreviewSession({
      reset: true,
      profileId: selectedProfileId || undefined,
      persona: selectedProfileId ? undefined : personaDraft,
    });
    pushPreviewToast('success', 'Preview reset.');
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
    if (profileBusy) return;
    setProfileBusy(true);
    try {
      let savedProfile: AutomationPreviewProfile;
      if (selectedProfileId) {
        savedProfile = await automationAPI.updatePreviewProfile(automation._id, selectedProfileId, {
          name: personaDraft.name,
          handle: personaDraft.handle || undefined,
          userId: personaDraft.userId || undefined,
          avatarUrl: personaDraft.avatarUrl,
        });
      } else {
        savedProfile = await automationAPI.createPreviewProfile(automation._id, {
          name: personaDraft.name,
          handle: personaDraft.handle || undefined,
          userId: personaDraft.userId || undefined,
          avatarUrl: personaDraft.avatarUrl,
        });
      }
      const updatedProfiles = await loadProfiles();
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
    if (!selectedProfileId || profileBusy) return;
    setProfileBusy(true);
    try {
      const duplicated = await automationAPI.duplicatePreviewProfile(automation._id, selectedProfileId);
      const updatedProfiles = await loadProfiles();
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
    if (!selectedProfileId || profileBusy) return;
    if (!confirm('Delete this mock profile?')) return;
    setProfileBusy(true);
    try {
      await automationAPI.deletePreviewProfile(automation._id, selectedProfileId);
      const updatedProfiles = await loadProfiles();
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
    if (!selectedProfileId || profileBusy) return;
    setProfileBusy(true);
    try {
      await automationAPI.setDefaultPreviewProfile(automation._id, selectedProfileId);
      const updatedProfiles = await loadProfiles();
      setProfiles(updatedProfiles);
    } catch (err) {
      console.error('Error setting default preview profile:', err);
      setProfilesError('Unable to set default profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const sendDisabled =
    previewSending ||
    previewInputValue.trim().length === 0 ||
    sessionStatus === 'completed';

  const renderTestConsole = () => (
    <Card className="flex flex-col min-h-0 h-full">
      
      <CardHeader className="grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        {/* <div className="space-y-1">
          <CardTitle>Test Console</CardTitle>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Mock-only DM simulator for this automation.
          </p>
        </div> */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-start">
          <Badge variant="neutral" className="hidden sm:inline-flex">Preview</Badge>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<PauseCircle className="w-4 h-4" />}
            onClick={handlePreviewPause}
            disabled={previewLoading || sessionStatus === 'paused'}
          >
            {sessionStatus === 'paused' ? 'Paused' : 'Pause'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<StopCircle className="w-4 h-4" />}
            onClick={handlePreviewStop}
            disabled={previewLoading || sessionStatus === 'completed'}
          >
            {sessionStatus === 'completed' ? 'Stopped' : 'Stop'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCcw className="w-4 h-4" />}
            onClick={handlePreviewReset}
            disabled={previewLoading}
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
              showSeen={
                previewMessages.length > 0 &&
                previewMessages[previewMessages.length - 1].from === 'ai'
              }
              mode="interactive"
              inputValue={previewInputValue}
              onInputChange={handlePreviewInputChange}
              onSubmit={handlePreviewSubmit}
              onInputFocus={() => setIsTyping(true)}
              onInputBlur={() => setIsTyping(false)}
              inputDisabled={sessionStatus === 'completed'}
              sendDisabled={sendDisabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderRightPane = () => (
    <div className="flex flex-col gap-4 min-h-0 h-full w-full">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2 py-1 w-full">
        {(() => {
          const tabs: Array<{ id: 'persona' | 'state' | 'timeline'; label: string }> = [
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
        />
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 gap-4">
      {!embedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <button onClick={onBack} className="hover:text-foreground transition-colors">
              Automations
            </button>
            <ArrowRight className="w-4 h-4" />
            <span className="font-medium text-foreground">{automation.name}</span>
            <ArrowRight className="w-4 h-4" />
            <span className="font-medium text-foreground">Preview</span>
            <Badge variant={statusConfig.variant} className="ml-1">
              {statusConfig.label}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="w-full sm:w-auto hidden sm:inline-flex"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(automation)}
              className="w-full sm:w-auto hidden sm:inline-flex"
            >
              Edit Automation
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{automation.name}</span>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
      )}

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
      {previewToast && (
        <div
          className={`fixed bottom-6 left-6 z-50 rounded-full px-4 py-2 text-xs font-semibold shadow-lg ${
            previewToast.status === 'success'
              ? 'bg-primary text-primary-foreground'
              : previewToast.status === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-card/95 border border-border text-foreground'
          }`}
        >
          {previewToast.message}
        </div>
      )}
    </div>
  );
};
