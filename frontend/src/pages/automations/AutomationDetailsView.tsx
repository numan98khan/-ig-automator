import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Copy,
  Loader2,
  Maximize2,
  PauseCircle,
  RefreshCcw,
  Save,
  Star,
  StopCircle,
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
  automationAPI,
} from '../../services/api';
import { AutomationPreviewPhone } from './AutomationPreviewPhone';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

type AutomationDetailsViewProps = {
  automation: AutomationInstance;
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  onBack: () => void;
  onEdit: (automation: AutomationInstance) => void;
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

export const AutomationDetailsView: React.FC<AutomationDetailsViewProps> = ({
  automation,
  accountDisplayName,
  accountHandle,
  accountAvatarUrl,
  accountInitial,
  onBack,
  onEdit,
}) => {
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<AutomationPreviewMessage[]>([]);
  const [previewInputValue, setPreviewInputValue] = useState('');
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
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
  const [consoleExpanded, setConsoleExpanded] = useState(false);
  const [rightPaneTab, setRightPaneTab] = useState<'persona' | 'state'>('persona');
  const [isTyping, setIsTyping] = useState(false);
  const [mobileView, setMobileView] = useState<'preview' | 'details'>('preview');
  const previewSessionIdRef = useRef<string | null>(null);

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
      setPreviewMessages(payload.messages);
    }
    const nextStatus = payload.status || payload.session?.status;
    if (nextStatus) {
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

  const startPreviewSession = useCallback(async (options?: {
    reset?: boolean;
    profileId?: string;
    persona?: AutomationPreviewPersona;
    sessionId?: string | null;
  }) => {
    setPreviewLoading(true);
    setPreviewStatus(null);
    try {
      const response = await automationAPI.createPreviewSession(automation._id, {
        reset: options?.reset,
        profileId: options?.profileId,
        persona: options?.persona,
        sessionId: options?.sessionId ?? previewSessionIdRef.current ?? undefined,
      });
      applyPreviewPayload(response);
      setPreviewMessages(response.messages || []);
    } catch (err) {
      console.error('Error starting preview session:', err);
      setPreviewStatus('Unable to start preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  }, [automation._id, applyPreviewPayload]);

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
      setPreviewStatus('Failed to apply mock persona.');
    }
  }, [automation._id, previewSessionId, applyPreviewPayload, startPreviewSession]);

  useEffect(() => {
    previewSessionIdRef.current = previewSessionId;
  }, [previewSessionId]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setPreviewSessionId(null);
      setPreviewMessages([]);
      setPreviewInputValue('');
      setPreviewStatus(null);
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
  }, [automation._id, loadProfiles, startPreviewSession]);

  useEffect(() => {
    if (!previewSessionId) return;
    void refreshPreviewState();
  }, [previewSessionId, refreshPreviewState]);

  const handlePreviewInputChange = (value: string) => {
    setPreviewInputValue(value);
    if (previewStatus) setPreviewStatus(null);
  };

  const handlePreviewSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sessionStatus === 'paused') {
      setPreviewStatus('Preview is paused. Resume or reset to continue.');
      return;
    }
    if (sessionStatus === 'completed') {
      setPreviewStatus('Preview is stopped. Reset to start a new run.');
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
    setPreviewStatus(null);

    try {
      const response = await automationAPI.sendPreviewMessage(automation._id, {
        text: trimmed,
        sessionId: previewSessionId || undefined,
        persona: selectedProfileId ? undefined : personaDraft,
      });
      if (response.sessionId && response.sessionId !== previewSessionId) {
        setPreviewSessionId(response.sessionId);
      }
      if (response.messages && response.messages.length > 0) {
        setPreviewMessages((prev) => [...prev, ...response.messages]);
      }
      applyPreviewPayload(response);
      if (!response.success) {
        setPreviewStatus(response.error || 'No automated response was generated.');
      }
    } catch (err) {
      console.error('Error sending preview message:', err);
      setPreviewStatus('Failed to send preview message.');
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
      setPreviewStatus('Preview paused.');
    } catch (err) {
      console.error('Error pausing preview session:', err);
      setPreviewStatus('Failed to pause preview session.');
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
      setPreviewStatus('Preview stopped.');
    } catch (err) {
      console.error('Error stopping preview session:', err);
      setPreviewStatus('Failed to stop preview session.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewReset = async () => {
    await startPreviewSession({
      reset: true,
      profileId: selectedProfileId || undefined,
      persona: selectedProfileId ? undefined : personaDraft,
    });
    setPreviewStatus('Preview reset.');
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

  const personaInitials = (personaDraft.name || 'MT').slice(0, 2).toUpperCase();
  const fieldEntries = useMemo(() => {
    const vars = previewState.session?.state?.vars || {};
    return Object.entries(vars)
      .filter(([key]) => !key.startsWith('agent'))
      .map(([key, value]) => ({ key, value: formatFieldValue(value) }));
  }, [previewState.session?.state?.vars]);
  const tags = previewState.conversation?.tags || [];
  const events: AutomationPreviewEvent[] = previewState.events || [];

  const sendDisabled =
    previewSending ||
    previewLoading ||
    previewInputValue.trim().length === 0 ||
    sessionStatus === 'completed';

  const renderTestConsole = (expanded: boolean) => (
    <Card className={`flex flex-col min-h-0 h-full ${expanded ? 'h-full' : ''}`}>
      
      <CardHeader className="grid grid-cols-1 gap-3 border-b border-border/60 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
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
        <div className="flex items-center justify-end gap-2">
          {!expanded && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Maximize2 className="w-4 h-4" />}
              onClick={() => setConsoleExpanded(true)}
            >
              Expand
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="h-full max-h-full w-full max-w-full sm:aspect-[9/19.5] sm:w-auto sm:max-w-full sm:min-h-0 min-h-0">
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
              inputDisabled={Boolean(previewLoading) || sessionStatus === 'completed'}
              sendDisabled={sendDisabled}
            />
          </div>
        </div>
        {previewStatus && (
          <div className="text-xs text-muted-foreground text-center">{previewStatus}</div>
        )}
      </CardContent>
    </Card>
  );

  const renderPersonaCard = () => (
    <Card className="flex flex-col min-h-0 flex-1">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/60">
        <div>
          <CardTitle>Mock Persona</CardTitle>
          <p className="text-xs text-muted-foreground">Saved presets keep test sessions consistent.</p>
        </div>
        {profilesLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto">
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
            {profilesError && <span className="text-xs text-destructive">{profilesError}</span>}
          </div>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={selectedProfileId || 'custom'}
            onChange={(event) => void handleSelectProfile(event.target.value)}
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
            >
              New
            </Button>
            <Button
              size="sm"
              leftIcon={<Save className="w-4 h-4" />}
              onClick={handleSaveProfile}
              isLoading={profileBusy}
            >
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Copy className="w-4 h-4" />}
              onClick={handleDuplicateProfile}
              disabled={!selectedProfileId || profileBusy}
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Star className="w-4 h-4" />}
              onClick={handleSetDefaultProfile}
              disabled={!selectedProfileId || profileBusy}
            >
              Set default
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={handleDeleteProfile}
              disabled={!selectedProfileId || profileBusy}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderStateCard = () => (
    <Card className="flex flex-col min-h-0 flex-1">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/60">
        <div>
          <CardTitle>Live Automation State</CardTitle>
          <p className="text-xs text-muted-foreground">Auto-updates every few seconds.</p>
        </div>
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto">
        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Current step</div>
          {previewState.currentNode ? (
            <div className="mt-2 space-y-2">
              <div>
                <div className="text-sm font-semibold">
                  {previewState.currentNode.label || previewState.currentNode.id || 'Active node'}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {previewState.currentNode.type.replace(/_/g, ' ')}
                </div>
              </div>
              {previewState.currentNode.preview && (
                <div className="text-xs text-muted-foreground">"{previewState.currentNode.preview}"</div>
              )}
              {previewState.currentNode.summary && previewState.currentNode.summary.length > 0 && (
                <div className="grid gap-1">
                  {previewState.currentNode.summary.map((item) => (
                    <div key={`${item.label}-${item.value}`} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">Waiting for the next trigger.</div>
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

        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Execution timeline</span>
          </div>
          {events.length > 0 ? (
            <div className="mt-3 max-h-64 overflow-y-auto space-y-3 pr-1">
              {events.map((event) => {
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
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">No events yet.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderRightPane = () => (
    <div className="flex flex-col gap-4 min-h-0 h-full">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2 py-1">
        {([
          { id: 'persona', label: 'Mock Persona' },
          { id: 'state', label: 'Automation State' },
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
      {rightPaneTab === 'persona' ? renderPersonaCard() : renderStateCard()}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 gap-4">
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
            onClick={() => onEdit(automation)}
            className="w-full sm:w-auto hidden sm:inline-flex"
          >
            Edit Automation
          </Button>
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] grid-rows-[minmax(0,1fr)] flex-1 min-h-0 overflow-hidden">
        <div className={`${mobileView === 'preview' ? 'block' : 'hidden'} sm:block h-full min-h-0`}>
          {renderTestConsole(false)}
        </div>
        <div className={`${mobileView === 'details' ? 'flex' : 'hidden'} sm:flex h-full min-h-0`}>
          {renderRightPane()}
        </div>
      </div>

      <Modal
        isOpen={consoleExpanded}
        onClose={() => setConsoleExpanded(false)}
        title="Expanded Test Console"
        size="full"
        className="h-[85vh]"
      >
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] grid-rows-[minmax(0,1fr)] h-full min-h-0 overflow-hidden">
          {renderTestConsole(true)}
          {renderRightPane()}
        </div>
      </Modal>
    </div>
  );
};
