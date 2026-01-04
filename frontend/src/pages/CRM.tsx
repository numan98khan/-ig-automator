import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  X,
  Filter,
  Mail,
  MessageSquare,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  crmAPI,
  CrmAutomationEvent,
  CrmContact,
  CrmNote,
  CrmStage,
  CrmTask,
  Message,
  tierAPI,
  workspaceAPI,
  WorkspaceMember,
} from '../services/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useTheme } from '../context/ThemeContext';

const stageTabs: Array<{ value: CrmStage | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const stageOrder: Record<CrmStage, number> = {
  new: 0,
  engaged: 1,
  qualified: 2,
  won: 3,
  lost: 4,
};

const stageLabels: Record<CrmStage, string> = {
  new: 'New',
  engaged: 'Engaged',
  qualified: 'Qualified',
  won: 'Won',
  lost: 'Lost',
};

const stageVariant: Record<CrmStage, 'secondary' | 'primary' | 'warning' | 'success' | 'danger'> = {
  new: 'secondary',
  engaged: 'primary',
  qualified: 'warning',
  won: 'success',
  lost: 'danger',
};

const quickReplies = [
  {
    label: 'Send catalog',
    text: 'Happy to help! Here is the catalog with options and pricing. Let me know what caught your eye.',
  },
  {
    label: 'Ask for size',
    text: 'What size are you looking for? I can recommend the best fit.',
  },
  {
    label: 'Share shipping',
    text: 'Shipping is 2-4 business days and we provide tracking. Where should we send it?',
  },
  {
    label: 'Follow-up nudge',
    text: 'Just checking in - did you want me to hold this for you or answer any questions?',
  },
];

const sortOptions = [
  { value: 'last_activity', label: 'Last activity' },
  { value: 'created', label: 'Created date' },
  { value: 'stage', label: 'Stage' },
  { value: 'lead_score', label: 'Lead score' },
];

const activityOptions = [
  { value: 0, label: 'All' },
  { value: 1, label: 'No reply 24h' },
  { value: 7, label: 'No reply 7d' },
  { value: 30, label: 'No reply 30d' },
];

const tagPillClass = 'inline-flex items-center rounded-full bg-muted/40 text-muted-foreground text-[11px] font-semibold px-2.5 py-1';

const DEFAULT_QUICK_FILTERS = {
  unread: false,
  noTags: false,
  hot: false,
  overdue: false,
  hasOpenTask: false,
  noReply24h: false,
};

type SortBy = 'last_activity' | 'created' | 'stage' | 'lead_score';

type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

type ContactForm = {
  participantName: string;
  participantHandle: string;
  contactEmail: string;
  contactPhone: string;
  stage: CrmStage;
  tags: string[];
  ownerId: string;
};

const buildSummary = (items: CrmContact[]) => {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const newToday = items.filter((contact) => new Date(contact.createdAt) >= startToday).length;
  const overdue = items.filter((contact) => (contact.overdueTaskCount || 0) > 0).length;
  const waiting = items.filter((contact) => {
    if (!contact.lastBusinessMessageAt) return false;
    if (!contact.lastCustomerMessageAt) return true;
    return new Date(contact.lastBusinessMessageAt) > new Date(contact.lastCustomerMessageAt);
  }).length;
  const qualified = items.filter((contact) => {
    if (contact.stage !== 'qualified') return false;
    const date = contact.updatedAt || contact.createdAt;
    return new Date(date) >= startWeek;
  }).length;
  return { newToday, overdue, waiting, qualified };
};

const formatDateTime = (value?: string | Date) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const formatRelativeTime = (value?: string | Date) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
};

const formatSla = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const diffMs = date.getTime() - Date.now();
  const minutes = Math.floor(Math.abs(diffMs) / 60000);
  if (minutes < 60) return diffMs < 0 ? `Overdue ${minutes}m` : `Due in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return diffMs < 0 ? `Overdue ${hours}h` : `Due in ${hours}h`;
  const days = Math.floor(hours / 24);
  return diffMs < 0 ? `Overdue ${days}d` : `Due in ${days}d`;
};

const getInitials = (contact: CrmContact) => {
  const base = contact.participantName || contact.participantHandle || 'C';
  const cleaned = base.replace('@', '').trim();
  return cleaned.charAt(0).toUpperCase();
};

const serializeContactForm = (form: ContactForm) => JSON.stringify({
  participantName: form.participantName.trim(),
  participantHandle: form.participantHandle.trim(),
  contactEmail: form.contactEmail.trim(),
  contactPhone: form.contactPhone.trim(),
  stage: form.stage,
  tags: form.tags,
  ownerId: form.ownerId || '',
});

const CRM: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<CrmStage, number>>({
    new: 0,
    engaged: 0,
    qualified: 0,
    won: 0,
    lost: 0,
  });
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [automationEvents, setAutomationEvents] = useState<CrmAutomationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<CrmStage | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [inactiveDays, setInactiveDays] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>('last_activity');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [activityView, setActivityView] = useState<'activity' | 'task' | 'note'>('activity');
  const [quickFilters, setQuickFilters] = useState(DEFAULT_QUICK_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [filterMenu, setFilterMenu] = useState<'tag' | 'activity' | 'sort' | null>(null);
  const [kanbanDrawerOpen, setKanbanDrawerOpen] = useState(false);
  const [drawerFocus, setDrawerFocus] = useState<'task' | 'note' | null>(null);
  const [draggingContactId, setDraggingContactId] = useState<string | null>(null);
  const [moveToast, setMoveToast] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<CrmStage>>(
    () => new Set<CrmStage>(['won', 'lost']),
  );
  const [summary, setSummary] = useState({
    newToday: 0,
    overdue: 0,
    waiting: 0,
    qualified: 0,
  });
  const [crmLocked, setCrmLocked] = useState(false);
  const [crmTierName, setCrmTierName] = useState<string | null>(null);
  const [crmAccessLoading, setCrmAccessLoading] = useState(false);

  const [contactForm, setContactForm] = useState<ContactForm>({
    participantName: '',
    participantHandle: '',
    contactEmail: '',
    contactPhone: '',
    stage: 'new',
    tags: [],
    ownerId: '',
  });
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveToast, setSaveToast] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const tagMenuRef = useRef<HTMLDivElement | null>(null);
  const activityMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const moveToastTimerRef = useRef<number | null>(null);

  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [taskDraft, setTaskDraft] = useState({
    title: '',
    description: '',
    dueAt: '',
    assignedTo: '',
    taskType: 'follow_up' as 'follow_up' | 'general',
  });
  const [savingTask, setSavingTask] = useState(false);
  const [quickTaskSaving, setQuickTaskSaving] = useState(false);


  const tagOptions = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [tagCounts]);

  const memberById = useMemo(() => {
    const map = new Map<string, WorkspaceMember>();
    members.forEach((member) => {
      if (member.user.id) map.set(member.user.id, member);
      if (member.user._id) map.set(member.user._id, member);
    });
    return map;
  }, [members]);

  const filteredContacts = useMemo(() => {
    let result = [...contacts];

    if (quickFilters.noTags) {
      result = result.filter((contact) => !contact.tags || contact.tags.length === 0);
    }
    if (quickFilters.unread) {
      result = result.filter((contact) => (contact.unreadCount || 0) > 0);
    }
    if (quickFilters.hot) {
      result = result.filter((contact) => {
        const stage = contact.stage || 'new';
        const tagMatch = (contact.tags || []).some((tag) => ['hot', 'vip', 'priority'].includes(tag));
        return stage === 'qualified' || stage === 'engaged' || tagMatch;
      });
    }
    if (quickFilters.overdue) {
      result = result.filter((contact) => (contact.overdueTaskCount || 0) > 0);
    }
    if (quickFilters.hasOpenTask) {
      result = result.filter((contact) => (contact.openTaskCount || 0) > 0);
    }
    if (quickFilters.noReply24h) {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      result = result.filter((contact) => {
        const lastTouch = contact.lastCustomerMessageAt || contact.lastMessageAt;
        return lastTouch ? new Date(lastTouch).getTime() <= cutoff : false;
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'stage') {
        const stageA = stageOrder[a.stage || 'new'];
        const stageB = stageOrder[b.stage || 'new'];
        if (stageA !== stageB) return stageA - stageB;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      }
      if (sortBy === 'lead_score') {
        return (b.leadScore || 0) - (a.leadScore || 0);
      }
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    return result;
  }, [contacts, quickFilters, sortBy]);

  const crmAccessBlocked = crmLocked && !crmAccessLoading;
  const isLightTheme = useMemo(() => {
    if (theme === 'light') return true;
    if (theme === 'dark') return false;
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  }, [theme]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === 'open'),
    [tasks],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem('crm_filters_open');
    if (stored === null) return;
    setFiltersOpen(stored === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('crm_filters_open', String(filtersOpen));
  }, [filtersOpen]);

  useEffect(() => {
    if (!filtersOpen) setFilterMenu(null);
  }, [filtersOpen]);

  useEffect(() => {
    if (viewMode === 'kanban' && stageFilter !== 'all') {
      setStageFilter('all');
    }
  }, [viewMode, stageFilter]);

  useEffect(() => {
    if (viewMode !== 'kanban') {
      setKanbanDrawerOpen(false);
    }
  }, [viewMode]);

  useEffect(() => {
    if (!selectedContactId) {
      setKanbanDrawerOpen(false);
    }
  }, [selectedContactId]);

  useEffect(() => {
    if (!kanbanDrawerOpen || !drawerFocus) return undefined;
    const timer = window.setTimeout(() => {
      if (drawerFocus === 'task') {
        setActivityView('task');
      }
      if (drawerFocus === 'note') {
        setActivityView('note');
      }
      setDrawerFocus(null);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [kanbanDrawerOpen, drawerFocus]);

  useEffect(() => {
    const next = searchInput.trim();
    const timer = window.setTimeout(() => setSearch(next), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    return () => {
      if (moveToastTimerRef.current) {
        window.clearTimeout(moveToastTimerRef.current);
      }
    };
  }, []);

  const loadMembers = async (workspaceId: string) => {
    if (crmAccessBlocked) return;
    try {
      const data = await workspaceAPI.getMembers(workspaceId);
      setMembers(data);
    } catch (error) {
      console.error('Failed to load workspace members', error);
      setMembers([]);
    }
  };

  const loadContacts = async (workspaceId: string) => {
    if (crmAccessBlocked) return;
    setLoading(true);
    try {
      const payload = await crmAPI.listContacts({
        workspaceId,
        search: search.trim() || undefined,
        stage: stageFilter === 'all' ? undefined : stageFilter,
        tags: tagFilter ? [tagFilter] : undefined,
        inactiveDays: inactiveDays || undefined,
      });
      setContacts(payload.contacts);
      setStageCounts(payload.stageCounts);
      setTagCounts(payload.tagCounts);
      setSummary(payload.summary || buildSummary(payload.contacts));
    } catch (error) {
      console.error('Failed to load CRM contacts', error);
      setContacts([]);
      setStageCounts({ new: 0, engaged: 0, qualified: 0, won: 0, lost: 0 });
      setTagCounts({});
      setSummary({ newToday: 0, overdue: 0, waiting: 0, qualified: 0 });
    } finally {
      setLoading(false);
    }
  };

  const loadContactDetail = async (conversationId: string) => {
    setDetailLoading(true);
    try {
      const [contactPayload, notesPayload, tasksPayload, automationPayload, messagePayload] = await Promise.all([
        crmAPI.getContact(conversationId),
        crmAPI.getNotes(conversationId),
        crmAPI.getTasks(conversationId),
        crmAPI.getAutomationEvents(conversationId),
        crmAPI.getMessages(conversationId),
      ]);

      setSelectedContact(contactPayload.contact);
      setNotes(notesPayload);
      setTasks(tasksPayload);
      setAutomationEvents(automationPayload);
      setMessages(messagePayload.slice(-20));
    } catch (error) {
      console.error('Failed to load CRM contact detail', error);
      setSelectedContact(null);
      setNotes([]);
      setTasks([]);
      setAutomationEvents([]);
      setMessages([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const pushSaveToast = (status: 'success' | 'error', message: string) => {
    setSaveToast({ status, message });
    window.setTimeout(() => setSaveToast(null), 1800);
  };

  const pushMoveToast = (message: string, onUndo?: () => void) => {
    setMoveToast({ message, onUndo });
    if (moveToastTimerRef.current) {
      window.clearTimeout(moveToastTimerRef.current);
    }
    moveToastTimerRef.current = window.setTimeout(() => {
      setMoveToast(null);
    }, 4500);
  };

  const clearMoveToast = () => {
    if (moveToastTimerRef.current) {
      window.clearTimeout(moveToastTimerRef.current);
      moveToastTimerRef.current = null;
    }
    setMoveToast(null);
  };

  const saveContact = async (nextForm: ContactForm, showToast = false) => {
    if (!selectedContact) return;
    setSaveState('saving');
    try {
      const updated = await crmAPI.updateContact(selectedContact._id, {
        participantName: nextForm.participantName,
        participantHandle: nextForm.participantHandle,
        contactEmail: nextForm.contactEmail,
        contactPhone: nextForm.contactPhone,
        stage: nextForm.stage,
        tags: nextForm.tags,
        ownerId: nextForm.ownerId || undefined,
      });
      setSelectedContact((prev) => (prev ? { ...prev, ...updated } : updated));
      setContacts((prev) => prev.map((item) => (
        item._id === updated._id ? { ...item, ...updated } : item
      )));
      lastSavedRef.current = serializeContactForm(nextForm);
      setSaveState('saved');
      if (showToast) pushSaveToast('success', 'Saved');
    } catch (error) {
      console.error('Failed to update contact', error);
      setSaveState('error');
      if (showToast) pushSaveToast('error', 'Save failed');
    }
  };

  const handleAddNote = async () => {
    if (!selectedContact || !noteDraft.trim()) return;
    setSavingNote(true);
    try {
      const note = await crmAPI.addNote(selectedContact._id, noteDraft.trim());
      setNotes((prev) => [note, ...prev]);
      setNoteDraft('');
    } catch (error) {
      console.error('Failed to add note', error);
    } finally {
      setSavingNote(false);
    }
  };

  const handleAddTask = async () => {
    if (!selectedContact || !taskDraft.title.trim()) return;
    setSavingTask(true);
    try {
      const payload = await crmAPI.addTask(selectedContact._id, {
        title: taskDraft.title.trim(),
        description: taskDraft.description.trim() || undefined,
        dueAt: taskDraft.dueAt || undefined,
        assignedTo: taskDraft.assignedTo || undefined,
        taskType: taskDraft.taskType,
      });
      setTasks((prev) => [payload, ...prev]);
      setTaskDraft({
        title: '',
        description: '',
        dueAt: '',
        assignedTo: '',
        taskType: 'follow_up',
      });
    } catch (error) {
      console.error('Failed to add task', error);
    } finally {
      setSavingTask(false);
    }
  };

  const handleQuickFollowup = () => {
    if (!selectedContact) return;
    setQuickTaskSaving(true);
    const due = new Date();
    due.setDate(due.getDate() + 1);
    setTaskDraft({
      title: 'Follow up',
      description: 'Check in and answer any remaining questions.',
      dueAt: due.toISOString().slice(0, 16),
      assignedTo: selectedContact.ownerId || '',
      taskType: 'follow_up',
    });
    setActivityView('task');
    setQuickTaskSaving(false);
  };

  const handleOpenTaskForm = () => {
    setTaskDraft((prev) => ({
      title: prev.title,
      description: prev.description,
      dueAt: prev.dueAt,
      assignedTo: prev.assignedTo || selectedContact?.ownerId || '',
      taskType: prev.taskType || 'general',
    }));
    setActivityView('task');
  };

  const handleOpenNoteForm = () => {
    setActivityView('note');
  };

  const handleTaskStatus = async (taskId: string, status: CrmTask['status']) => {
    if (!selectedContact) return;
    try {
      const updated = await crmAPI.updateTask(selectedContact._id, taskId, { status });
      setTasks((prev) => prev.map((task) => (task._id === updated._id ? updated : task)));
    } catch (error) {
      console.error('Failed to update task', error);
    }
  };

  const handleQuickReplyCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushSaveToast('success', 'Copied');
    } catch (error) {
      console.error('Failed to copy quick reply', error);
      pushSaveToast('error', 'Copy failed');
    }
  };

  const handleClearFilters = () => {
    setTagFilter('');
    setInactiveDays(0);
    setQuickFilters(DEFAULT_QUICK_FILTERS);
  };

  const applyStageUpdate = async (
    contactId: string,
    nextStage: CrmStage,
    options?: { previousStage?: CrmStage; skipToast?: boolean },
  ) => {
    const target = contacts.find((contact) => contact._id === contactId);
    if (!target) return;
    const previousStage = options?.previousStage || target.stage || 'new';
    if (previousStage === nextStage) return;

    const applyLocal = (stage: CrmStage) => {
      setContacts((prev) => prev.map((item) => (item._id === contactId ? { ...item, stage } : item)));
      setSelectedContact((prev) => (prev && prev._id === contactId ? { ...prev, stage } : prev));
      if (selectedContactId === contactId) {
        setContactForm((prev) => ({ ...prev, stage }));
      }
    };

    applyLocal(nextStage);

    try {
      await crmAPI.updateContact(contactId, { stage: nextStage });
      if (!options?.skipToast) {
        const label = nextStage.charAt(0).toUpperCase() + nextStage.slice(1);
        pushMoveToast(`Moved to ${label}`, () => {
          applyStageUpdate(contactId, previousStage, { previousStage: nextStage, skipToast: true });
        });
      }
      if (currentWorkspace) {
        loadContacts(currentWorkspace._id);
      }
    } catch (error) {
      console.error('Failed to update stage', error);
      applyLocal(previousStage);
    }
  };

  const handleDragStart = (contactId: string) => (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('text/plain', contactId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingContactId(contactId);
  };

  const handleDragEnd = () => {
    setDraggingContactId(null);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleColumnDrop = (stage: CrmStage) => async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const contactId = event.dataTransfer.getData('text/plain') || draggingContactId;
    if (!contactId) return;
    await applyStageUpdate(contactId, stage);
    setDraggingContactId(null);
  };

  const toggleColumnCollapse = (stage: CrmStage) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  };

  const openDrawerForContact = (contactId: string, focus?: 'task' | 'note') => {
    setSelectedContactId(contactId);
    setKanbanDrawerOpen(true);
    setDrawerFocus(focus || null);
  };

  useEffect(() => {
    if (!currentWorkspace) return;
    let isActive = true;
    let pollTimer: number | undefined;
    const loadTierAccess = async () => {
      setCrmAccessLoading(true);
      try {
        const summary = await tierAPI.getWorkspace(currentWorkspace._id);
        const limits = summary?.limits || summary?.tier?.limits || {};
        const allowed = limits.crm !== false;
        if (isActive) {
          setCrmLocked(!allowed);
          setCrmTierName(summary?.tier?.name || null);
        }
      } catch (error) {
        console.error('Failed to load CRM tier access', error);
        if (isActive) {
          setCrmLocked(false);
          setCrmTierName(null);
        }
      } finally {
        if (isActive) {
          setCrmAccessLoading(false);
        }
      }
    };
    loadTierAccess();
    pollTimer = window.setInterval(loadTierAccess, 15000);
    return () => {
      isActive = false;
      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
    };
  }, [currentWorkspace]);

  useEffect(() => {
    if (!crmAccessBlocked) return;
    setSelectedContactId(null);
    setSelectedContact(null);
    setNotes([]);
    setTasks([]);
    setAutomationEvents([]);
    setMessages([]);
  }, [crmAccessBlocked]);

  useEffect(() => {
    if (!currentWorkspace || crmAccessBlocked) return;
    loadMembers(currentWorkspace._id);
  }, [currentWorkspace, crmAccessBlocked]);

  useEffect(() => {
    if (!currentWorkspace || crmAccessBlocked) return;
    loadContacts(currentWorkspace._id);
  }, [currentWorkspace, search, stageFilter, tagFilter, inactiveDays, crmAccessBlocked]);

  useEffect(() => {
    if (!contacts.length) {
      setSelectedContactId(null);
      setSelectedContact(null);
      return;
    }
    const stillExists = selectedContactId && contacts.some((contact) => contact._id === selectedContactId);
    if (!stillExists) {
      setSelectedContactId(contacts[0]._id);
    }
  }, [contacts, selectedContactId]);

  useEffect(() => {
    if (!selectedContactId) {
      setSelectedContact(null);
      setNotes([]);
      setTasks([]);
      setAutomationEvents([]);
      setMessages([]);
      setSaveState('saved');
      setActivityView('activity');
      return;
    }
    if (crmAccessBlocked) {
      return;
    }
    loadContactDetail(selectedContactId);
  }, [selectedContactId, crmAccessBlocked]);

  useEffect(() => {
    if (!selectedContact) return;
    const nextForm: ContactForm = {
      participantName: selectedContact.participantName || '',
      participantHandle: selectedContact.participantHandle || '',
      contactEmail: selectedContact.contactEmail || '',
      contactPhone: selectedContact.contactPhone || '',
      stage: selectedContact.stage || 'new',
      tags: selectedContact.tags || [],
      ownerId: selectedContact.ownerId || '',
    };
    setContactForm(nextForm);
    lastSavedRef.current = serializeContactForm(nextForm);
    setSaveState('saved');
    setActivityView('activity');
  }, [selectedContact]);

  useEffect(() => {
    if (!selectedContact) return undefined;
    const serialized = serializeContactForm(contactForm);
    if (serialized === lastSavedRef.current) {
      if (saveState !== 'saving') setSaveState('saved');
      return undefined;
    }
    setSaveState('dirty');
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveContact(contactForm);
    }, 800);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [contactForm, selectedContact, saveState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (selectedContact) {
          saveContact(contactForm, true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [contactForm, selectedContact]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!statsOpen) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (statsRef.current && !statsRef.current.contains(event.target as Node)) {
        setStatsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStatsOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [statsOpen]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const handleClick = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!filterMenu) return undefined;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        (tagMenuRef.current && tagMenuRef.current.contains(target)) ||
        (activityMenuRef.current && activityMenuRef.current.contains(target)) ||
        (sortMenuRef.current && sortMenuRef.current.contains(target))
      ) {
        return;
      }
      setFilterMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterMenu(null);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [filterMenu]);

  if (!currentWorkspace) {
    return (
      <div className="p-6 text-muted-foreground">
        Select a workspace to view CRM contacts.
      </div>
    );
  }

  const activeContacts = filteredContacts;
  const totalContacts = stageFilter === 'all'
    ? Object.values(stageCounts).reduce((sum, count) => sum + count, 0)
    : stageCounts[stageFilter as CrmStage] || 0;
  const quickFilterCount = Object.values(quickFilters).filter(Boolean).length;
  const activeFilterCount = (tagFilter ? 1 : 0) + (inactiveDays ? 1 : 0) + quickFilterCount;
  const hasActiveFilters = activeFilterCount > 0;
  const selectedSortLabel = sortOptions.find((option) => option.value === sortBy)?.label || 'Last activity';
  const selectedActivityLabel = activityOptions.find((option) => option.value === inactiveDays)?.label || 'All';
  const visibleMessages = messages.slice(-8);
  const hasMoreMessages = messages.length > visibleMessages.length;
  const detailsPanelContent = (
    <>
      {!selectedContact && !detailLoading && (
        <div className="text-sm text-muted-foreground">Select a contact to view CRM details.</div>
      )}
      {detailLoading && (
        <div className="text-sm text-muted-foreground">Loading contact details...</div>
      )}
      {selectedContact && !detailLoading && (
        <div className="flex flex-col h-full gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-semibold">
                {getInitials(selectedContact)}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {selectedContact.participantName || 'Contact'}
                </p>
                <p className="text-xs text-muted-foreground">{selectedContact.participantHandle}</p>
                <Badge variant={stageVariant[selectedContact.stage || 'new']} className="mt-2">
                  {(selectedContact.stage || 'new').toUpperCase()}
                </Badge>
              </div>
            </div>
            {viewMode === 'kanban' && (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<MessageSquare className="w-4 h-4" />}
                type="button"
                onClick={() => navigate(`/app/inbox?conversationId=${selectedContact._id}`)}
              >
                Open in Inbox
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Tags</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {contactForm.tags.length > 0 ? (
                  contactForm.tags.map((tag) => (
                    <span key={tag} className={tagPillClass}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className={tagPillClass}>No tags</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Custom fields</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={tagPillClass}>No custom fields</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Contact details</p>
            {(selectedContact.contactEmail || selectedContact.contactPhone) ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                {selectedContact.contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5" />
                    <span>{selectedContact.contactEmail}</span>
                  </div>
                )}
                {selectedContact.contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{selectedContact.contactPhone}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No contact details yet.</p>
            )}
            <div className="text-xs text-muted-foreground">
              Owner: {selectedContact.ownerId ? (memberById.get(selectedContact.ownerId)?.user.email
                || memberById.get(selectedContact.ownerId)?.user.instagramUsername
                || 'Teammate') : 'Unassigned'}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Automation activity</h3>
            </div>
            {automationEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No automation sessions recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {automationEvents.map((session) => (
                  <div key={session._id} className="border border-border/60 rounded-xl p-3">
                    <p className="text-sm font-semibold text-foreground">
                      {session.automationName || session.templateName || 'Automation session'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(session.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="relative h-full flex flex-col">
      {crmAccessBlocked && (
        <div
          className={`absolute inset-0 z-40 flex items-center justify-center rounded-2xl p-6 ${isLightTheme ? 'bg-slate-200/70' : 'bg-black/60'} backdrop-blur-sm`}
        >
          <div className="max-w-xl w-full rounded-2xl border border-border bg-card p-6 shadow-xl text-center space-y-4">
            <Badge variant="secondary" className="uppercase tracking-[0.3em] text-[10px]">
              Upgrade required
            </Badge>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Unlock the CRM workspace</h2>
              <p className="text-sm text-muted-foreground">
                You&apos;re seeing a preview of the CRM workspace. Upgrade your plan to manage contacts, tasks, and automation insights.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
              {[
                'Contact pipeline and stage tracking',
                'Notes, tasks, and ownership assignments',
                'Automation event history per contact',
                'Lead scoring and smart filters',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col md:flex-row items-center justify-center gap-3">
              <Button
                onClick={() => navigate('/app/settings?tab=plan')}
                className="w-full md:w-auto"
              >
                View upgrade options
              </Button>
              {crmTierName && (
                <span className="text-xs text-muted-foreground">Current plan: {crmTierName}</span>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={crmAccessBlocked ? 'pointer-events-none select-none blur-sm' : ''}>
        <div className="flex flex-col h-full min-h-0 gap-4">
          <div className="sticky top-0 z-20">
          <div className="glass-panel rounded-2xl px-2.5 py-2 space-y-2 overflow-visible">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 md:flex-nowrap md:min-h-[52px]">
            {viewMode !== 'kanban' && (
              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap min-w-[180px] md:max-w-[420px] flex-1 md:flex-none">
                {stageTabs.map((stage) => (
                  <button
                    key={stage.value}
                    onClick={() => setStageFilter(stage.value)}
                    className={`h-8 px-3 rounded-full text-[11px] font-semibold transition ${stageFilter === stage.value
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
                  >
                    {stage.label}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {stage.value === 'all'
                        ? totalContacts
                        : stageCounts[stage.value as CrmStage] || 0}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-w-[180px] md:min-w-[240px]">
              <Input
                ref={searchRef}
                placeholder="Search contacts"
                aria-label="Search contacts"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setSearchInput('');
                    setSearch('');
                  }
                }}
                icon={<Search className="w-4 h-4" />}
                className="h-9 bg-muted/40 border-transparent focus-visible:ring-primary/30 focus-visible:ring-offset-0"
              />
            </div>
            <div className="flex items-center gap-2 justify-between md:justify-end w-full md:w-auto">
              <div className="hidden lg:inline-flex items-center rounded-lg bg-muted/40 p-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`h-8 px-3 rounded-md text-xs font-semibold transition ${viewMode === 'list'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`h-8 px-3 rounded-md text-xs font-semibold transition ${viewMode === 'kanban'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Kanban
                </button>
              </div>
              <div className="relative" ref={statsRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatsOpen((prev) => !prev)}
                  leftIcon={<BarChart3 className="w-4 h-4" />}
                  className={`h-8 px-3 ${statsOpen ? 'bg-primary/10 text-primary' : 'bg-muted/40 hover:bg-muted/60'}`}
                >
                  Stats
                </Button>
                {statsOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-background shadow-xl p-3 text-xs z-40">
                    <div className="space-y-2 text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>New today</span>
                        <span className="font-semibold text-foreground">{summary.newToday}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Overdue follow-ups</span>
                        <span className="font-semibold text-foreground">{summary.overdue}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Waiting reply</span>
                        <span className="font-semibold text-foreground">{summary.waiting}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Qualified this week</span>
                        <span className="font-semibold text-foreground">{summary.qualified}</span>
                      </div>
                      <div className="pt-2 border-t border-border/60">
                        <Badge variant="secondary">{currentWorkspace.name}</Badge>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFiltersOpen((prev) => !prev)}
                className={`h-8 px-3 ${filtersOpen || hasActiveFilters
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted/40 hover:bg-muted/60'
                  }`}
              >
                {hasActiveFilters ? `Advanced (${activeFilterCount})` : 'Advanced'}
              </Button>
              <div className="relative lg:hidden" ref={moreRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMoreOpen((prev) => !prev)}
                  leftIcon={<MoreVertical className="w-4 h-4" />}
                  className={`h-8 px-3 ${moreOpen ? 'bg-primary/10 text-primary' : 'bg-muted/40 hover:bg-muted/60'}`}
                >
                  More
                </Button>
                {moreOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-background shadow-xl p-2 text-xs z-40">
                    <p className="px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">View</p>
                    <button
                      onClick={() => {
                        setViewMode('list');
                        setMoreOpen(false);
                      }}
                      className={`w-full text-left px-2 h-8 rounded-md ${viewMode === 'list'
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                      List view
                    </button>
                    <button
                      onClick={() => {
                        setViewMode('kanban');
                        setMoreOpen(false);
                      }}
                      className={`w-full text-left px-2 h-8 rounded-md ${viewMode === 'kanban'
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                      Kanban view
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {filtersOpen && (
            <div className="pt-2 border-t border-border/40 overflow-visible">
              <div className="flex items-center gap-2 flex-nowrap overflow-visible">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="relative" ref={tagMenuRef}>
                    <button
                      type="button"
                      onClick={() => setFilterMenu((prev) => (prev === 'tag' ? null : 'tag'))}
                      className={`h-8 px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-2 transition ${filterMenu === 'tag'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/40 text-foreground hover:bg-muted/60'
                        }`}
                    >
                      <span className="truncate max-w-[140px]">Tag: {tagFilter || 'All'}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {filterMenu === 'tag' && (
                      <div className="absolute left-0 mt-2 w-48 rounded-xl border border-border bg-background shadow-xl p-1 text-xs z-40">
                        <button
                          onClick={() => {
                            setTagFilter('');
                            setFilterMenu(null);
                          }}
                          className={`w-full text-left px-2 h-8 rounded-md ${!tagFilter
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                            }`}
                        >
                          All
                        </button>
                        {tagOptions.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              setTagFilter(tag);
                              setFilterMenu(null);
                            }}
                            className={`w-full text-left px-2 h-8 rounded-md ${tagFilter === tag
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                              }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative" ref={activityMenuRef}>
                    <button
                      type="button"
                      onClick={() => setFilterMenu((prev) => (prev === 'activity' ? null : 'activity'))}
                      className={`h-8 px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-2 transition ${filterMenu === 'activity'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/40 text-foreground hover:bg-muted/60'
                        }`}
                    >
                      <span>Activity: {selectedActivityLabel}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {filterMenu === 'activity' && (
                      <div className="absolute left-0 mt-2 w-48 rounded-xl border border-border bg-background shadow-xl p-1 text-xs z-40">
                        {activityOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setInactiveDays(option.value);
                              setFilterMenu(null);
                            }}
                            className={`w-full text-left px-2 h-8 rounded-md ${inactiveDays === option.value
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                              }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative" ref={sortMenuRef}>
                    <button
                      type="button"
                      onClick={() => setFilterMenu((prev) => (prev === 'sort' ? null : 'sort'))}
                      className={`h-8 px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-2 transition ${filterMenu === 'sort'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/40 text-foreground hover:bg-muted/60'
                        }`}
                    >
                      <span>Sort: {selectedSortLabel}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    {filterMenu === 'sort' && (
                      <div className="absolute left-0 mt-2 w-48 rounded-xl border border-border bg-background shadow-xl p-1 text-xs z-40">
                        {sortOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSortBy(option.value as SortBy);
                              setFilterMenu(null);
                            }}
                            className={`w-full text-left px-2 h-8 rounded-md ${sortBy === option.value
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                              }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearFilters}
                      className="h-8 px-3 bg-muted/30 hover:bg-muted/50"
                    >
                      Clear
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap flex-1 min-w-0 pb-1">
                  {[
                    { key: 'unread', label: 'Unread' },
                    { key: 'noTags', label: 'No tags' },
                    { key: 'hot', label: 'Hot leads' },
                    { key: 'overdue', label: 'Overdue' },
                    { key: 'hasOpenTask', label: 'Open task' },
                    { key: 'noReply24h', label: 'No reply (24h)' },
                  ].map((chip) => (
                    <button
                      key={chip.key}
                      onClick={() =>
                        setQuickFilters((prev) => ({
                          ...prev,
                          [chip.key]: !prev[chip.key as keyof typeof prev],
                        }))
                      }
                      className={`h-8 px-3 rounded-full text-[11px] font-semibold transition flex-shrink-0 ${quickFilters[chip.key as keyof typeof quickFilters]
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                        }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      <div className="flex-1 min-h-0">
          {viewMode === 'kanban' ? (
            <div className="flex-1 min-h-0 relative">
              <div className="glass-panel rounded-2xl p-4 h-full overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 w-6 pointer-events-none bg-gradient-to-r from-background/80 to-transparent" />
                <div className="absolute inset-y-0 right-0 w-6 pointer-events-none bg-gradient-to-l from-background/80 to-transparent" />
                <div className="flex gap-3 overflow-x-auto h-full pr-4 pb-2">
                  {(['new', 'engaged', 'qualified', 'won', 'lost'] as CrmStage[]).map((stage) => {
                    const columnContacts = activeContacts.filter((contact) => (contact.stage || 'new') === stage);
                    const isCollapsed = collapsedColumns.has(stage);
                    return (
                      <div
                        key={stage}
                        className={`flex flex-col h-full flex-shrink-0 ${isCollapsed ? 'min-w-[96px]' : 'min-w-[260px] max-w-[280px]'}`}
                        onDragOver={handleColumnDragOver}
                        onDrop={handleColumnDrop(stage)}
                      >
                        <div className={`flex items-center justify-between mb-2 px-2 ${isCollapsed ? 'justify-center' : ''}`}>
                          <button
                            onClick={() => toggleColumnCollapse(stage)}
                            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                          >
                            {stageLabels[stage]} ({columnContacts.length})
                          </button>
                          {!isCollapsed && (
                            <button
                              onClick={() => toggleColumnCollapse(stage)}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              Collapse
                            </button>
                          )}
                        </div>
                        {!isCollapsed && (
                          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                            {columnContacts.length === 0 && (
                              <div className="rounded-xl border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                                <p>No leads here.</p>
                                {hasActiveFilters && (
                                  <button
                                    onClick={handleClearFilters}
                                    className="mt-2 text-primary hover:text-primary/80"
                                  >
                                    Clear filters
                                  </button>
                                )}
                              </div>
                            )}
                            {columnContacts.map((contact) => {
                              const tags = contact.tags || [];
                              const visibleTags = tags.slice(0, 2);
                              const extraTags = tags.length - visibleTags.length;
                              const isHot = tags.some((tag) => ['hot', 'vip', 'priority'].includes(tag));
                              const hasUnread = (contact.unreadCount || 0) > 0;
                              const hasTask = (contact.openTaskCount || 0) > 0;
                              const hasOverdue = (contact.overdueTaskCount || 0) > 0;
                              return (
                                <div
                                  key={contact._id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => openDrawerForContact(contact._id)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') openDrawerForContact(contact._id);
                                  }}
                                  draggable
                                  onDragStart={handleDragStart(contact._id)}
                                  onDragEnd={handleDragEnd}
                                  className="group relative rounded-xl bg-card/70 border border-border/40 p-3 text-left cursor-pointer hover:border-primary/40 transition"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground truncate">
                                        {contact.participantName || 'Unknown'}
                                        <span className="ml-2 text-xs text-muted-foreground">
                                          {contact.participantHandle}
                                        </span>
                                      </p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      {formatRelativeTime(contact.lastMessageAt)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {contact.lastMessage || 'No messages yet'}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                                    {hasUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                                    {hasTask && <ClipboardList className="w-3 h-3" />}
                                    {hasOverdue && <CalendarClock className="w-3 h-3 text-amber-500" />}
                                    {isHot && <Sparkles className="w-3 h-3 text-amber-400" />}
                                  </div>
                                  <div className="flex items-center gap-1 mt-2">
                                    {visibleTags.map((tag) => (
                                      <span key={tag} className={tagPillClass}>
                                        {tag}
                                      </span>
                                    ))}
                                    {extraTags > 0 && (
                                      <span className={tagPillClass}>+{extraTags}</span>
                                    )}
                                  </div>
                                  <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition">
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openDrawerForContact(contact._id, 'task');
                                        }}
                                        className={`${tagPillClass} hover:text-foreground`}
                                      >
                                        Task
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openDrawerForContact(contact._id, 'note');
                                        }}
                                        className={`${tagPillClass} hover:text-foreground`}
                                      >
                                        Note
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {kanbanDrawerOpen && (
                <>
                  <button
                    type="button"
                    className="absolute inset-0 bg-background/40 backdrop-blur-sm z-20"
                    onClick={() => setKanbanDrawerOpen(false)}
                  />
                  <div className="absolute inset-y-0 right-0 w-full max-w-[440px] md:max-w-[35%] bg-background border-l border-border shadow-2xl z-30 flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background">
                      <div className="text-sm font-semibold text-foreground">Contact details</div>
                      <button
                        type="button"
                        onClick={() => setKanbanDrawerOpen(false)}
                        className="h-8 w-8 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted/80 flex items-center justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-background">
                      <div className="flex flex-col min-h-0">{detailsPanelContent}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-4 flex-1 min-h-0">
              <div className="glass-panel rounded-2xl p-3 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground">Contact list</p>
                  </div>
                  {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
                </div>
                <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-0">
                  {activeContacts.length === 0 && !loading && (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      No contacts match your filters.
                    </div>
                  )}
                  {activeContacts.map((contact) => {
                    const tags = contact.tags || [];
                    const visibleTags = tags.slice(0, 2);
                    const extraTags = tags.length - visibleTags.length;
                    const owner = contact.ownerId ? memberById.get(contact.ownerId) : undefined;
                    return (
                      <button
                        key={contact._id}
                        onClick={() => setSelectedContactId(contact._id)}
                        className={`w-full text-left border rounded-xl px-3 py-2 transition ${contact._id === selectedContactId
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-border/60 hover:border-primary/30'
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                            {getInitials(contact)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">
                                  {contact.participantName || 'Unknown'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {contact.participantHandle}
                                </p>
                              </div>
                              <Badge variant={stageVariant[contact.stage || 'new']}>
                                {(contact.stage || 'new').toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate">
                              {contact.lastMessage || 'No messages yet'}
                            </p>
                            <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <span>{formatRelativeTime(contact.lastMessageAt)}</span>
                                {contact.unreadCount ? (
                                  <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px]">
                                    {contact.unreadCount}
                                  </span>
                                ) : null}
                                {owner && (
                                  <span className="text-[10px]">{owner.user.email || owner.user.instagramUsername}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {visibleTags.map((tag) => (
                                  <span key={tag} className={tagPillClass}>
                                    {tag}
                                  </span>
                                ))}
                                {extraTags > 0 && (
                                  <span className={tagPillClass}>+{extraTags}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-4 flex flex-col min-h-0">
                {!selectedContact && !detailLoading && (
                  <div className="text-sm text-muted-foreground">Select a contact to view activity.</div>
                )}
                {detailLoading && (
                  <div className="text-sm text-muted-foreground">Loading conversation...</div>
                )}
                {selectedContact && !detailLoading && (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                          {getInitials(selectedContact)}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-foreground">{selectedContact.participantName || 'Contact'}</p>
                          <p className="text-xs text-muted-foreground">{selectedContact.participantHandle}</p>
                        </div>
                        <Badge variant={stageVariant[selectedContact.stage || 'new']}>
                          {(selectedContact.stage || 'new').toUpperCase()}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<MessageSquare className="w-4 h-4" />}
                        type="button"
                        onClick={() => navigate(`/app/inbox?conversationId=${selectedContact._id}`)}
                      >
                        Open in Inbox
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<CalendarClock className="w-4 h-4" />}
                        onClick={handleQuickFollowup}
                        isLoading={quickTaskSaving}
                      >
                        Create follow-up
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={handleOpenTaskForm}
                      >
                        Create task
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<StickyNote className="w-4 h-4" />}
                        onClick={handleOpenNoteForm}
                      >
                        Add note
                      </Button>
                      <Button size="sm" variant="outline" disabled>
                        Quote / Order
                      </Button>
                    </div>

                    {activityView !== 'activity' && (
                      <div className="mb-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<ChevronDown className="w-4 h-4 rotate-90" />}
                          onClick={() => setActivityView('activity')}
                        >
                          Back to activity
                        </Button>
                      </div>
                    )}

                    {activityView === 'activity' && (
                      <>
                        <div className="border border-border/60 rounded-xl p-3 mb-3">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Sparkles className="w-4 h-4" />
                            Quick replies
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {quickReplies.map((reply) => (
                              <button
                                key={reply.label}
                                onClick={() => handleQuickReplyCopy(reply.text)}
                                className="px-3 py-1 rounded-full border border-border/70 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40"
                              >
                                {reply.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex-1 min-h-0">
                          {hasMoreMessages && (
                            <p className="text-xs text-muted-foreground mb-2">
                              Showing the latest {visibleMessages.length} messages.
                            </p>
                          )}
                          <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1">
                            {messages.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No messages recorded yet.</p>
                            ) : (
                              visibleMessages.map((message) => (
                                <div
                                  key={message._id}
                                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.from === 'customer'
                                    ? 'bg-muted text-foreground'
                                    : message.from === 'ai'
                                      ? 'bg-primary/10 text-foreground ml-auto'
                                      : 'bg-secondary text-secondary-foreground ml-auto'
                                    }`}
                                >
                                  <p>{message.text || 'Attachment'}</p>
                                  <p className="text-[10px] text-muted-foreground mt-1 text-right">
                                    {formatDateTime(message.createdAt)}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {activityView === 'task' && (
                      <div className="space-y-4 flex-1 min-h-0">
                        <div className="rounded-xl border border-border/60 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold text-foreground">Create task</h3>
                          </div>
                          <Input
                            label="Title"
                            value={taskDraft.title}
                            onChange={(e) => setTaskDraft((prev) => ({ ...prev, title: e.target.value }))}
                          />
                          <Input
                            label="Description"
                            value={taskDraft.description}
                            onChange={(e) => setTaskDraft((prev) => ({ ...prev, description: e.target.value }))}
                          />
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Due date/time</label>
                            <input
                              type="datetime-local"
                              className="input-field"
                              value={taskDraft.dueAt}
                              onChange={(e) => setTaskDraft((prev) => ({ ...prev, dueAt: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Assignee</label>
                            <select
                              className="input-field"
                              value={taskDraft.assignedTo}
                              onChange={(e) => setTaskDraft((prev) => ({ ...prev, assignedTo: e.target.value }))}
                            >
                              <option value="">Unassigned</option>
                              {members.map((member) => (
                                <option key={member.user.id || member.user._id} value={member.user.id || member.user._id}>
                                  {member.user.email || member.user.instagramUsername || 'Teammate'}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1">Task type</label>
                            <select
                              className="input-field"
                              value={taskDraft.taskType}
                              onChange={(e) => setTaskDraft((prev) => ({
                                ...prev,
                                taskType: e.target.value as 'follow_up' | 'general',
                              }))}
                            >
                              <option value="follow_up">Follow-up</option>
                              <option value="general">General</option>
                            </select>
                          </div>
                          <Button onClick={handleAddTask} isLoading={savingTask} size="sm">
                            Create task
                          </Button>
                        </div>

                        <div className="rounded-xl border border-border/60 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CalendarClock className="w-4 h-4 text-primary" />
                              <h3 className="text-sm font-semibold text-foreground">Open tasks</h3>
                            </div>
                            <Badge variant="secondary">{openTasks.length}</Badge>
                          </div>
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {tasks.length === 0 && (
                              <p className="text-xs text-muted-foreground">No tasks yet.</p>
                            )}
                            {tasks.map((task) => (
                              <div
                                key={task._id}
                                className="border border-border/60 rounded-xl p-3 flex items-start justify-between gap-3"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-foreground text-sm">{task.title}</p>
                                    <Badge variant={task.status === 'completed' ? 'success' : 'secondary'}>
                                      {task.status}
                                    </Badge>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                                  )}
                                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <CalendarClock className="w-3 h-3" />
                                      Due {formatDateTime(task.dueAt)}
                                    </span>
                                    <span>{formatSla(task.dueAt)}</span>
                                  </div>
                                </div>
                                {task.status === 'open' && (
                                  <button
                                    onClick={() => handleTaskStatus(task._id, 'completed')}
                                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Complete
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {activityView === 'note' && (
                      <div className="space-y-4 flex-1 min-h-0">
                        <div className="rounded-xl border border-border/60 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <StickyNote className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold text-foreground">Add note</h3>
                          </div>
                          <textarea
                            className="input-field min-h-[120px]"
                            placeholder="Capture context, next steps, or personal preferences."
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                          />
                          <Button onClick={handleAddNote} isLoading={savingNote} size="sm">
                            Save note
                          </Button>
                        </div>

                        <div className="rounded-xl border border-border/60 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <StickyNote className="w-4 h-4 text-primary" />
                            <h3 className="text-sm font-semibold text-foreground">Recent notes</h3>
                          </div>
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {notes.length === 0 && (
                              <p className="text-xs text-muted-foreground">No notes yet.</p>
                            )}
                            {notes.map((note) => (
                              <div key={note._id} className="border border-border/60 rounded-xl p-3">
                                <p className="text-sm text-foreground">{note.body}</p>
                                <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                                  <span>{note.author?.name || 'Teammate'}</span>
                                  <span>{formatDateTime(note.createdAt)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-4 flex flex-col min-h-0">
                {detailsPanelContent}
              </div>
            </div>
          )}
        </div>
      </div>

      {saveToast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-full px-4 py-2 text-xs font-semibold shadow-lg ${saveToast.status === 'success'
          ? 'bg-primary text-primary-foreground'
          : 'bg-red-500 text-white'
          }`}
        >
          {saveToast.message}
        </div>
      )}
      {moveToast && (
        <div className="fixed bottom-16 left-6 z-50 rounded-full px-4 py-2 text-xs font-semibold shadow-lg bg-card/95 border border-border flex items-center gap-3">
          <span>{moveToast.message}</span>
          {moveToast.onUndo && (
            <button
              type="button"
              onClick={() => {
                moveToast.onUndo?.();
                clearMoveToast();
              }}
              className="text-primary hover:text-primary/80"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CRM;
