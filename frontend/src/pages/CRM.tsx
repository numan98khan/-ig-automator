import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Filter,
  LayoutGrid,
  List,
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
  workspaceAPI,
  WorkspaceMember,
} from '../services/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

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
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [quickFilters, setQuickFilters] = useState(DEFAULT_QUICK_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [summary, setSummary] = useState({
    newToday: 0,
    overdue: 0,
    waiting: 0,
    qualified: 0,
  });

  const [contactForm, setContactForm] = useState<ContactForm>({
    participantName: '',
    participantHandle: '',
    contactEmail: '',
    contactPhone: '',
    stage: 'new',
    tags: [],
    ownerId: '',
  });
  const [tagInput, setTagInput] = useState('');

  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveToast, setSaveToast] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

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

  const notesRef = useRef<HTMLDivElement | null>(null);
  const tasksRef = useRef<HTMLDivElement | null>(null);

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

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === 'open'),
    [tasks],
  );

  const overdueTasks = useMemo(() => {
    const now = Date.now();
    return openTasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < now);
  }, [openTasks]);

  const nextTask = useMemo(() => {
    if (!openTasks.length) return null;
    const sorted = [...openTasks].sort((a, b) => {
      const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
    return sorted[0];
  }, [openTasks]);

  useEffect(() => {
    const stored = window.localStorage.getItem('crm_filters_open');
    if (stored === null) return;
    setFiltersOpen(stored === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('crm_filters_open', String(filtersOpen));
  }, [filtersOpen]);

  useEffect(() => {
    const next = searchInput.trim();
    const timer = window.setTimeout(() => setSearch(next), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadMembers = async (workspaceId: string) => {
    try {
      const data = await workspaceAPI.getMembers(workspaceId);
      setMembers(data);
    } catch (error) {
      console.error('Failed to load workspace members', error);
      setMembers([]);
    }
  };

  const loadContacts = async (workspaceId: string) => {
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

  const handleAddTag = () => {
    const nextTag = tagInput.trim().toLowerCase();
    if (!nextTag) return;
    if (contactForm.tags.includes(nextTag)) {
      setTagInput('');
      return;
    }
    const updated = { ...contactForm, tags: [...contactForm.tags, nextTag] };
    setContactForm(updated);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    const updated = { ...contactForm, tags: contactForm.tags.filter((item) => item !== tag) };
    setContactForm(updated);
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

  const handleQuickFollowup = async () => {
    if (!selectedContact) return;
    setQuickTaskSaving(true);
    try {
      const due = new Date();
      due.setDate(due.getDate() + 1);
      const payload = await crmAPI.addTask(selectedContact._id, {
        title: 'Follow up',
        description: 'Check in and answer any remaining questions.',
        dueAt: due.toISOString(),
        assignedTo: contactForm.ownerId || undefined,
        taskType: 'follow_up',
      });
      setTasks((prev) => [payload, ...prev]);
    } catch (error) {
      console.error('Failed to create follow-up', error);
    } finally {
      setQuickTaskSaving(false);
    }
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

  const handleOutcome = async (stage: 'won' | 'lost') => {
    if (!selectedContact) return;
    const reason = window.prompt(`Why was this marked ${stage.toUpperCase()}? (optional)`);
    const updatedForm = { ...contactForm, stage } as ContactForm;
    setContactForm(updatedForm);
    await saveContact(updatedForm, true);
    if (reason && reason.trim()) {
      try {
        const note = await crmAPI.addNote(selectedContact._id, `${stage.toUpperCase()} reason: ${reason.trim()}`);
        setNotes((prev) => [note, ...prev]);
      } catch (error) {
        console.error('Failed to add outcome note', error);
      }
    }
  };

  useEffect(() => {
    if (!currentWorkspace) return;
    loadMembers(currentWorkspace._id);
  }, [currentWorkspace]);

  useEffect(() => {
    if (!currentWorkspace) return;
    loadContacts(currentWorkspace._id);
  }, [currentWorkspace, search, stageFilter, tagFilter, inactiveDays]);

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
      return;
    }
    loadContactDetail(selectedContactId);
  }, [selectedContactId]);

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
    setTagInput('');
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

  if (!currentWorkspace) {
    return (
      <div className="p-6 text-muted-foreground">
        Select a workspace to view CRM contacts.
      </div>
    );
  }

  const activeContacts = viewMode === 'list' ? filteredContacts : contacts;
  const totalContacts = stageFilter === 'all'
    ? Object.values(stageCounts).reduce((sum, count) => sum + count, 0)
    : stageCounts[stageFilter as CrmStage] || 0;
  const quickFilterCount = Object.values(quickFilters).filter(Boolean).length;
  const activeFilterCount = (tagFilter ? 1 : 0) + (inactiveDays ? 1 : 0) + quickFilterCount;
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="sticky top-0 z-20">
        <div className="glass-panel rounded-2xl px-2.5 py-2 space-y-2">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 md:flex-nowrap md:min-h-[52px]">
            
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap md:max-w-[420px] flex-1 md:flex-none">
              {stageTabs.map((stage) => (
                <button
                  key={stage.value}
                  onClick={() => setStageFilter(stage.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${stageFilter === stage.value
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-transparent text-muted-foreground border-border/70 hover:text-foreground'
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
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-2 justify-between md:justify-end w-full md:w-auto">
              <div className="hidden lg:flex items-center gap-2">
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  leftIcon={<List className="w-4 h-4" />}
                >
                  List
                </Button>
                <Button
                  variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('kanban')}
                  leftIcon={<LayoutGrid className="w-4 h-4" />}
                >
                  Kanban
                </Button>
              </div>
              <div className="relative" ref={statsRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatsOpen((prev) => !prev)}
                  leftIcon={<BarChart3 className="w-4 h-4" />}
                >
                  Stats
                </Button>
                {statsOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-background shadow-xl p-3 text-xs z-30">
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
                variant={filtersOpen || hasActiveFilters ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setFiltersOpen((prev) => !prev)}
              >
                {hasActiveFilters ? `Filters (${activeFilterCount})` : 'Filters'}
              </Button>
              <div className="relative lg:hidden" ref={moreRef}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMoreOpen((prev) => !prev)}
                  leftIcon={<MoreVertical className="w-4 h-4" />}
                >
                  More
                </Button>
                {moreOpen && (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-background shadow-xl p-2 text-xs z-30">
                    <p className="px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">View</p>
                    <button
                      onClick={() => {
                        setViewMode('list');
                        setMoreOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-md ${viewMode === 'list'
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
                      className={`w-full text-left px-2 py-1.5 rounded-md ${viewMode === 'kanban'
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
            <div className="pt-2 border-t border-border/60 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Tag</label>
                  <select
                    className="input-field"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                  >
                    <option value="">All tags</option>
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag} ({tagCounts[tag]})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Activity</label>
                  <select
                    className="input-field"
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(Number(e.target.value))}
                  >
                    <option value={0}>All activity</option>
                    <option value={1}>No reply 24h</option>
                    <option value={7}>No reply 7d</option>
                    <option value={30}>No reply 30d</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Sort</label>
                  <select
                    className="input-field"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                    Clear
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs overflow-x-auto whitespace-nowrap">
                {[
                  { key: 'unread', label: 'Unread' },
                  { key: 'noTags', label: 'No tags' },
                  { key: 'hot', label: 'Hot leads' },
                  { key: 'overdue', label: 'Overdue' },
                  { key: 'hasOpenTask', label: 'Has open task' },
                  { key: 'noReply24h', label: 'No reply 24h' },
                ].map((chip) => (
                  <button
                    key={chip.key}
                    onClick={() =>
                      setQuickFilters((prev) => ({
                        ...prev,
                        [chip.key]: !prev[chip.key as keyof typeof prev],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-full border transition flex-shrink-0 ${quickFilters[chip.key as keyof typeof quickFilters]
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'bg-transparent text-muted-foreground border-border/70 hover:text-foreground'
                      }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_360px] gap-4 flex-1 min-h-0">
        <div className="glass-panel rounded-2xl p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground">Contact list</p>
            </div>
            {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>
          {viewMode === 'list' ? (
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
                              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                                {tag}
                              </span>
                            ))}
                            {extraTags > 0 && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">+{extraTags}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pr-1 flex-1 min-h-0">
              {(['new', 'engaged', 'qualified', 'won', 'lost'] as CrmStage[]).map((stage) => {
                const stageContacts = filteredContacts.filter((contact) => contact.stage === stage);
                return (
                  <div key={stage} className="min-w-[220px] flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs uppercase text-muted-foreground font-semibold">{stage}</span>
                      <Badge variant={stageVariant[stage]}>{stageContacts.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {stageContacts.map((contact) => (
                        <button
                          key={contact._id}
                          onClick={() => setSelectedContactId(contact._id)}
                          className={`w-full text-left border rounded-lg px-3 py-2 transition ${contact._id === selectedContactId
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border/60 hover:border-primary/30'
                            }`}
                        >
                          <p className="text-sm font-semibold text-foreground truncate">
                            {contact.participantName || 'Unknown'}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{contact.participantHandle}</p>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {contact.lastMessage || 'No messages yet'}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(contact.lastMessageAt)}
                          </span>
                        </button>
                      ))}
                      {stageContacts.length === 0 && (
                        <div className="text-xs text-muted-foreground">No contacts</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
                  asChild
                >
                  <Link to={`/inbox?conversationId=${selectedContact._id}`}>Open in Inbox</Link>
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
                  onClick={() => tasksRef.current?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Create task
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<StickyNote className="w-4 h-4" />}
                  onClick={() => notesRef.current?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Add note
                </Button>
                <Button size="sm" variant="outline" disabled>
                  Quote / Order
                </Button>
              </div>

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

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages recorded yet.</p>
                ) : (
                  messages.map((message) => (
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
            </>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4 flex flex-col min-h-0">
          {!selectedContact && !detailLoading && (
            <div className="text-sm text-muted-foreground">Select a contact to view CRM details.</div>
          )}
          {detailLoading && (
            <div className="text-sm text-muted-foreground">Loading contact details...</div>
          )}
          {selectedContact && !detailLoading && (
            <div className="flex flex-col h-full">
              <div className="sticky top-0 bg-card/95 pb-3 border-b border-border z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={stageVariant[contactForm.stage]}>{contactForm.stage.toUpperCase()}</Badge>
                    {saveState === 'saving' && <Badge variant="secondary">Saving...</Badge>}
                    {saveState === 'dirty' && <Badge variant="warning">Unsaved</Badge>}
                    {saveState === 'saved' && <Badge variant="success">Saved</Badge>}
                    {saveState === 'error' && <Badge variant="danger">Failed</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 mt-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
                    <select
                      className="input-field"
                      value={contactForm.stage}
                      onChange={(e) => setContactForm((prev) => ({
                        ...prev,
                        stage: e.target.value as CrmStage,
                      }))}
                    >
                      {(['new', 'engaged', 'qualified', 'won', 'lost'] as CrmStage[]).map((stage) => (
                        <option key={stage} value={stage}>{stage}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Tags</label>
                    <div className="flex flex-wrap gap-2">
                      {contactForm.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-muted text-muted-foreground"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        className="input-field"
                        placeholder="Add tag"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <Button variant="outline" size="sm" onClick={handleAddTag}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Assign owner</label>
                    <select
                      className="input-field"
                      value={contactForm.ownerId}
                      onChange={(e) => setContactForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.user.id || member.user._id} value={member.user.id || member.user._id}>
                          {member.user.email || member.user.instagramUsername || 'Teammate'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => notesRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Add note
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => tasksRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Create task
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleOutcome('won')}>
                    Mark Won
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleOutcome('lost')}>
                    Mark Lost
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1">
                <details className="rounded-xl border border-border/60 p-3" open>
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">Details</summary>
                  <div className="mt-3 space-y-3">
                    <Input
                      label="Name"
                      value={contactForm.participantName}
                      onChange={(e) => setContactForm((prev) => ({ ...prev, participantName: e.target.value }))}
                    />
                    <Input
                      label="Handle"
                      value={contactForm.participantHandle}
                      onChange={(e) => setContactForm((prev) => ({ ...prev, participantHandle: e.target.value }))}
                    />
                    {(contactForm.contactEmail || contactForm.contactPhone) ? (
                      <>
                        {contactForm.contactEmail && (
                          <Input
                            label="Email"
                            value={contactForm.contactEmail}
                            onChange={(e) => setContactForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                            icon={<Mail className="w-4 h-4" />}
                          />
                        )}
                        {contactForm.contactPhone && (
                          <Input
                            label="Phone"
                            value={contactForm.contactPhone}
                            onChange={(e) => setContactForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                            icon={<Phone className="w-4 h-4" />}
                          />
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No contact details yet. Add email/phone when you have it.
                      </div>
                    )}
                  </div>
                </details>

                <details className="rounded-xl border border-border/60 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">Custom fields</summary>
                  <div className="mt-3 text-xs text-muted-foreground">
                    No custom fields yet.
                  </div>
                </details>

                <div ref={tasksRef} className="rounded-xl border border-border/60 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Tasks & follow-ups</h3>
                  </div>

                  <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                    <p className="uppercase tracking-[0.2em] text-[10px]">Next action</p>
                    {nextTask ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-sm font-semibold text-foreground">{nextTask.title}</p>
                        <p>Due {formatDateTime(nextTask.dueAt)}</p>
                        <p>{formatSla(nextTask.dueAt)}</p>
                      </div>
                    ) : (
                      <p className="mt-2">No open tasks</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {tasks.length === 0 && (
                      <p className="text-xs text-muted-foreground">No tasks yet. Add one below.</p>
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

                  <div className="border-t border-border/50 pt-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Add task</p>
                    <div className="space-y-2">
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
                  </div>
                </div>

                <div ref={notesRef} className="rounded-xl border border-border/60 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <StickyNote className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Notes</h3>
                  </div>

                  <div className="space-y-2">
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

                  <div className="border-t border-border/50 pt-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Add note</p>
                    <textarea
                      className="input-field min-h-[90px]"
                      placeholder="Capture context, next steps, or personal preferences."
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <Button onClick={handleAddNote} isLoading={savingNote} className="mt-2" size="sm">
                      Save note
                    </Button>
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
                    <div className="space-y-2">
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
    </div>
  );
};

export default CRM;
