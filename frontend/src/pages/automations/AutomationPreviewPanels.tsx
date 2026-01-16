import React, { useMemo, useState } from 'react';
import { Copy, Loader2, Save, Star, Trash2, UserCircle2 } from 'lucide-react';
import {
  AutomationPreviewConversation,
  AutomationPreviewEvent,
  AutomationPreviewMessage,
  AutomationPreviewPersona,
  AutomationPreviewProfile,
  AutomationSession,
  AutomationSessionNodeSummary,
} from '../../services/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

type PersonaPanelProps = {
  persona: AutomationPreviewPersona;
  profiles: AutomationPreviewProfile[];
  profilesLoading: boolean;
  profilesError?: string | null;
  selectedProfileId: string | null;
  profileBusy: boolean;
  actionsDisabled?: boolean;
  onSelectProfile: (value: string) => void | Promise<void>;
  onNewProfile: () => void;
  onSaveProfile: () => void;
  onDuplicateProfile: () => void;
  onSetDefaultProfile: () => void;
  onDeleteProfile: () => void;
  onPersonaChange: (next: AutomationPreviewPersona) => void;
};

type StatePanelProps = {
  currentNode?: AutomationSessionNodeSummary | null;
  session?: AutomationSession | null;
  conversation?: AutomationPreviewConversation | null;
  messages?: AutomationPreviewMessage[];
  showConversationHistory?: boolean;
  canViewHistory?: boolean;
  prepend?: React.ReactNode;
};

type TimelinePanelProps = {
  events: AutomationPreviewEvent[];
};

export const mergePreviewEvents = (
  existing: AutomationPreviewEvent[],
  incoming?: AutomationPreviewEvent[],
) => {
  if (!incoming || incoming.length === 0) return existing;
  const merged = new Map(existing.map((event) => [event.id, event]));
  incoming.forEach((event) => {
    merged.set(event.id, event);
  });
  return Array.from(merged.values()).sort((a, b) => (
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  ));
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

const formatDurationSeconds = (valueMs?: number | null) => {
  if (valueMs === null || valueMs === undefined) return 'n/a';
  const safeMs = Math.max(0, valueMs);
  const seconds = safeMs / 1000;
  if (Number.isNaN(seconds)) return '';
  const precision = seconds < 10 ? 1 : 0;
  return `${seconds.toFixed(precision)}s`;
};

export const AutomationPreviewPersonaPanel: React.FC<PersonaPanelProps> = ({
  persona,
  profiles,
  profilesLoading,
  profilesError,
  selectedProfileId,
  profileBusy,
  actionsDisabled,
  onSelectProfile,
  onNewProfile,
  onSaveProfile,
  onDuplicateProfile,
  onSetDefaultProfile,
  onDeleteProfile,
  onPersonaChange,
}) => {
  const personaInitials = (persona.name || 'MT').slice(0, 2).toUpperCase();

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      onPersonaChange({ ...persona, avatarUrl: result });
    };
    reader.readAsDataURL(file);
  };

  const handleClearAvatar = () => {
    onPersonaChange({ ...persona, avatarUrl: '' });
  };

  return (
    <Card className="flex flex-col min-h-0 flex-1 w-full">
      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto pt-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-14 w-14 rounded-full overflow-hidden bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground">
            {persona.avatarUrl ? (
              <img src={persona.avatarUrl} alt={persona.name} className="h-full w-full object-cover" />
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
            value={persona.name}
            onChange={(event) => onPersonaChange({ ...persona, name: event.target.value })}
          />
          <Input
            label="Mock IG handle"
            value={persona.handle}
            onChange={(event) => onPersonaChange({ ...persona, handle: event.target.value })}
          />
          <Input
            label="Mock user ID"
            value={persona.userId}
            onChange={(event) => onPersonaChange({ ...persona, userId: event.target.value })}
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
            onChange={(event) => void onSelectProfile(event.target.value)}
            disabled={actionsDisabled}
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
              onClick={onNewProfile}
              disabled={actionsDisabled}
            >
              New
            </Button>
            <Button
              size="sm"
              leftIcon={<Save className="w-4 h-4" />}
              onClick={onSaveProfile}
              isLoading={profileBusy}
              disabled={actionsDisabled}
            >
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Copy className="w-4 h-4" />}
              onClick={onDuplicateProfile}
              disabled={!selectedProfileId || profileBusy || actionsDisabled}
            >
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Star className="w-4 h-4" />}
              onClick={onSetDefaultProfile}
              disabled={!selectedProfileId || profileBusy || actionsDisabled}
            >
              Set default
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={onDeleteProfile}
              disabled={!selectedProfileId || profileBusy || actionsDisabled}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const AutomationPreviewStatePanel: React.FC<StatePanelProps> = ({
  currentNode,
  session,
  conversation,
  messages,
  showConversationHistory = false,
  canViewHistory = false,
  prepend,
}) => {
  const fieldEntries = useMemo(() => {
    const vars = session?.state?.vars || {};
    return Object.entries(vars)
      .filter(([key]) => !key.startsWith('agent'))
      .map(([key, value]) => ({ key, value: formatFieldValue(value) }));
  }, [session?.state?.vars]);

  const agentSlotEntries = useMemo(() => {
    const slots = session?.state?.vars?.agentSlots;
    if (!slots || typeof slots !== 'object') return [];
    return Object.entries(slots).map(([key, value]) => ({ key, value: formatFieldValue(value) }));
  }, [session?.state?.vars?.agentSlots]);

  const agentMissingSlots = useMemo(() => {
    const missing = session?.state?.vars?.agentMissingSlots;
    if (!missing) return [];
    return Array.isArray(missing) ? missing.filter(Boolean) : [];
  }, [session?.state?.vars?.agentMissingSlots]);

  const tags = conversation?.tags || [];
  const summaryText = conversation?.aiSummary?.trim() || '';
  const summaryUpdatedAt = formatTime(conversation?.aiSummaryUpdatedAt);
  const sortedMessages = useMemo(() => {
    if (!messages || messages.length === 0) return [];
    const decorated = messages.map((message, index) => ({
      message,
      index,
      timestamp: message.createdAt ? new Date(message.createdAt as string).getTime() : null,
    }));
    decorated.sort((a, b) => {
      if (a.timestamp !== null && b.timestamp !== null && a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.timestamp !== null && b.timestamp === null) return -1;
      if (a.timestamp === null && b.timestamp !== null) return 1;
      return a.index - b.index;
    });
    return decorated.map((entry) => entry.message);
  }, [messages]);

  return (
    <Card className="flex flex-col min-h-0 flex-1 w-full">
      <CardContent className="space-y-4 flex-1 min-h-0 overflow-y-auto pt-6">
        {prepend}
        <div className="rounded-lg border border-border/60 bg-background/60 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Current step</div>
          {currentNode ? (() => {
            const nodeTypeKey = currentNode.type?.toLowerCase() || '';
            const nodeMeta = NODE_TYPE_BADGES[nodeTypeKey];
            const nodeLabel = currentNode.label || currentNode.id || 'Active node';
            const nodeTypeLabel = nodeMeta?.label || currentNode.type?.replace(/_/g, ' ') || 'Step';
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

        {showConversationHistory && !canViewHistory && (
          <div className="rounded-lg border border-border/60 bg-background/60 p-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Conversation insights</div>
            <div className="mt-2 text-xs text-muted-foreground">
              Upgrade to view message history and the conversation summary.
            </div>
          </div>
        )}

        {showConversationHistory && canViewHistory && (
          <>
            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Conversation summary</div>
              {summaryText ? (
                <div className="mt-2 text-sm text-foreground">{summaryText}</div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">No summary yet.</div>
              )}
              {summaryUpdatedAt && (
                <div className="mt-2 text-[11px] text-muted-foreground">Updated {summaryUpdatedAt}</div>
              )}
            </div>

            <div className="rounded-lg border border-border/60 bg-background/60 p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Message history</div>
              {sortedMessages.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {sortedMessages.map((message, index) => {
                    const label = message.from === 'customer' ? 'Customer' : 'AI';
                    const timeLabel = formatTime(message.createdAt);
                    return (
                      <div
                        key={`${message.id || 'message'}-${index}`}
                        className="rounded-md border border-border/60 bg-background/80 px-3 py-2"
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{label}</span>
                          {timeLabel && <span>{timeLabel}</span>}
                        </div>
                        <div className="mt-1 text-sm text-foreground">{message.text}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground">No messages yet.</div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export const AutomationPreviewTimelinePanel: React.FC<TimelinePanelProps> = ({ events }) => {
  const [eventFilters, setEventFilters] = useState<Record<string, boolean>>(buildDefaultEventFilters);
  const sortedEvents = useMemo(() => (
    [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  ), [events]);
  const eventDurations = useMemo(() => {
    const durations = new Map<string, number>();
    sortedEvents.forEach((event) => {
      if (typeof event.details?.durationMs === 'number') {
        durations.set(event.id, Math.max(0, event.details.durationMs));
      }
    });
    return durations;
  }, [sortedEvents]);
  const filteredEvents = useMemo(() => (
    sortedEvents.filter((event) => eventFilters[event.type] ?? true)
  ), [eventFilters, sortedEvents]);

  return (
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
              const durationLabel = formatDurationSeconds(eventDurations.get(event.id));
              const timeLabel = formatTime(event.createdAt);
              const subtitle = timeLabel ? `${timeLabel} · ${durationLabel}` : durationLabel;
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <div className="flex-1">
                    <div className="text-sm">{event.message}</div>
                    <div className="text-xs text-muted-foreground">{subtitle}</div>
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
};
