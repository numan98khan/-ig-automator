import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Filter,
  Mail,
  Phone,
  Search,
  Sparkles,
  StickyNote,
  UserCircle2,
  Users,
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

const stageOptions: { value: CrmStage; label: string; helper: string }[] = [
  { value: 'new', label: 'New', helper: 'Fresh leads' },
  { value: 'engaged', label: 'Engaged', helper: 'Two-way convo' },
  { value: 'qualified', label: 'Qualified', helper: 'Ready to buy' },
  { value: 'won', label: 'Won', helper: 'Closed deal' },
  { value: 'lost', label: 'Lost', helper: 'Not moving' },
];

const stageVariant: Record<CrmStage, 'secondary' | 'primary' | 'warning' | 'success' | 'danger'> = {
  new: 'secondary',
  engaged: 'primary',
  qualified: 'warning',
  won: 'success',
  lost: 'danger',
};

const inactiveOptions = [
  { value: 0, label: 'All activity' },
  { value: 7, label: 'No reply 7d' },
  { value: 30, label: 'No reply 30d' },
];

const automationStatusVariant: Record<string, 'secondary' | 'warning' | 'success' | 'danger'> = {
  active: 'secondary',
  paused: 'warning',
  completed: 'success',
  handoff: 'danger',
};

const formatDate = (value?: string | Date) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
};

const formatDateTime = (value?: string | Date) => {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

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

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<CrmStage | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [inactiveDays, setInactiveDays] = useState(0);

  const [contactForm, setContactForm] = useState({
    participantName: '',
    participantHandle: '',
    contactEmail: '',
    contactPhone: '',
    stage: 'new' as CrmStage,
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');
  const [savingContact, setSavingContact] = useState(false);

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

  const tagOptions = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [tagCounts]);

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
    } catch (error) {
      console.error('Failed to load CRM contacts', error);
      setContacts([]);
      setStageCounts({
        new: 0,
        engaged: 0,
        qualified: 0,
        won: 0,
        lost: 0,
      });
      setTagCounts({});
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
      return;
    }
    loadContactDetail(selectedContactId);
  }, [selectedContactId]);

  useEffect(() => {
    if (!selectedContact) return;
    setContactForm({
      participantName: selectedContact.participantName || '',
      participantHandle: selectedContact.participantHandle || '',
      contactEmail: selectedContact.contactEmail || '',
      contactPhone: selectedContact.contactPhone || '',
      stage: selectedContact.stage || 'new',
      tags: selectedContact.tags || [],
    });
    setTagInput('');
  }, [selectedContact]);

  const handleAddTag = () => {
    const nextTag = tagInput.trim().toLowerCase();
    if (!nextTag) return;
    if (contactForm.tags.includes(nextTag)) {
      setTagInput('');
      return;
    }
    setContactForm((prev) => ({
      ...prev,
      tags: [...prev.tags, nextTag],
    }));
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setContactForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((item) => item !== tag),
    }));
  };

  const handleSaveContact = async () => {
    if (!selectedContact) return;
    setSavingContact(true);
    try {
      const updated = await crmAPI.updateContact(selectedContact._id, {
        participantName: contactForm.participantName,
        participantHandle: contactForm.participantHandle,
        contactEmail: contactForm.contactEmail,
        contactPhone: contactForm.contactPhone,
        stage: contactForm.stage,
        tags: contactForm.tags,
      });
      setSelectedContact(updated);
      setContacts((prev) => prev.map((item) => (item._id === updated._id ? updated : item)));
    } catch (error) {
      console.error('Failed to update contact', error);
    } finally {
      setSavingContact(false);
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

  const handleTaskStatus = async (taskId: string, status: CrmTask['status']) => {
    if (!selectedContact) return;
    try {
      const updated = await crmAPI.updateTask(selectedContact._id, taskId, { status });
      setTasks((prev) => prev.map((task) => (task._id === updated._id ? updated : task)));
    } catch (error) {
      console.error('Failed to update task', error);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="p-6 text-muted-foreground">
        Select a workspace to view CRM contacts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">CRM</p>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" />
            Contacts & Pipeline
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track lead stages, log notes, and schedule follow-ups without leaving the inbox.
          </p>
        </div>
        <div className="glass-panel rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>{contacts.length} contacts</span>
          </div>
          <Badge variant="secondary">{currentWorkspace.name}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stageOptions.map((stage) => (
          <button
            key={stage.value}
            onClick={() => setStageFilter(stageFilter === stage.value ? 'all' : stage.value)}
            className={`glass-panel rounded-2xl p-4 text-left border transition ${stageFilter === stage.value
              ? 'border-primary/50 shadow-sm'
              : 'border-border/50 hover:border-primary/30'
              }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{stage.label}</p>
              <Badge variant={stageVariant[stage.value]}>{stageCounts[stage.value] || 0}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{stage.helper}</p>
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Search"
            placeholder="Name, handle, email, or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Tag</label>
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
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">Activity filter</label>
            <select
              className="input-field"
              value={inactiveDays}
              onChange={(e) => setInactiveDays(Number(e.target.value))}
            >
              {inactiveOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6">
        <div className="glass-panel rounded-2xl p-4 h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">Contact list</p>
            {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
          </div>
          <div className="space-y-3">
            {contacts.length === 0 && !loading && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No contacts match your filters.
              </div>
            )}
            {contacts.map((contact) => (
              <button
                key={contact._id}
                onClick={() => setSelectedContactId(contact._id)}
                className={`w-full text-left border rounded-2xl p-4 transition shadow-sm ${contact._id === selectedContactId
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/60 hover:border-primary/30'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {contact.participantName || 'Unknown contact'}
                    </p>
                    <p className="text-xs text-muted-foreground">{contact.participantHandle}</p>
                  </div>
                  <Badge variant={stageVariant[contact.stage || 'new']}>
                    {(contact.stage || 'new').toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-2 max-h-10 overflow-hidden">
                  {contact.lastMessage || 'No messages yet'}
                </p>
                <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                  <span>{formatDateTime(contact.lastMessageAt)}</span>
                  <span>{contact.tags?.length || 0} tags</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {!selectedContact && !detailLoading && (
            <div className="glass-panel rounded-2xl p-6 text-muted-foreground">
              Select a contact to view their CRM profile.
            </div>
          )}

          {detailLoading && (
            <div className="glass-panel rounded-2xl p-6 text-muted-foreground">
              Loading contact details...
            </div>
          )}

          {selectedContact && !detailLoading && (
            <div className="space-y-4">
              <div className="glass-panel rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Profile</p>
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                      <UserCircle2 className="w-5 h-5 text-primary" />
                      {selectedContact.participantName || 'Contact'}
                    </h2>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveContact}
                    isLoading={savingContact}
                  >
                    Save updates
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  <Input
                    label="Email"
                    value={contactForm.contactEmail}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                    icon={<Mail className="w-4 h-4" />}
                  />
                  <Input
                    label="Phone"
                    value={contactForm.contactPhone}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                    icon={<Phone className="w-4 h-4" />}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[240px,1fr] gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">Stage</label>
                    <select
                      className="input-field"
                      value={contactForm.stage}
                      onChange={(e) => setContactForm((prev) => ({
                        ...prev,
                        stage: e.target.value as CrmStage,
                      }))}
                    >
                      {stageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">Tags</label>
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
                    <p className="uppercase tracking-[0.2em] text-[10px]">Last message</p>
                    <p className="text-foreground font-semibold mt-1">{formatDateTime(selectedContact.lastMessageAt)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
                    <p className="uppercase tracking-[0.2em] text-[10px]">Created</p>
                    <p className="text-foreground font-semibold mt-1">{formatDate(selectedContact.createdAt)}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
                    <p className="uppercase tracking-[0.2em] text-[10px]">Tags</p>
                    <p className="text-foreground font-semibold mt-1">{selectedContact.tags?.length || 0}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
                    <p className="uppercase tracking-[0.2em] text-[10px]">Stage</p>
                    <p className="text-foreground font-semibold mt-1">{(selectedContact.stage || 'new').toUpperCase()}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1fr,1fr] gap-4">
                <div className="glass-panel rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">Tasks & follow-ups</h3>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {tasks.length === 0 && (
                      <p className="text-sm text-muted-foreground">No tasks yet. Add a follow-up below.</p>
                    )}
                    {tasks.map((task) => (
                      <div
                        key={task._id}
                        className="border border-border/60 rounded-xl p-3 flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground">{task.title}</p>
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
                              Due {formatDate(task.dueAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {task.assignedTo?.name || 'Unassigned'}
                            </span>
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

                  <div className="border-t border-border/50 pt-4">
                    <p className="text-sm font-semibold text-foreground mb-2">Add task</p>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">Due date</label>
                          <input
                            type="date"
                            className="input-field"
                            value={taskDraft.dueAt}
                            onChange={(e) => setTaskDraft((prev) => ({ ...prev, dueAt: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">Assignee</label>
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
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">Task type</label>
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
                      <Button onClick={handleAddTask} isLoading={savingTask}>
                        Create task
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <StickyNote className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">Notes & context</h3>
                  </div>

                  <div className="space-y-3">
                    {notes.length === 0 && (
                      <p className="text-sm text-muted-foreground">No notes yet. Add internal context below.</p>
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

                  <div className="border-t border-border/50 pt-4">
                    <p className="text-sm font-semibold text-foreground mb-2">Add note</p>
                    <textarea
                      className="input-field min-h-[120px]"
                      placeholder="Capture context, next steps, or personal preferences."
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <Button onClick={handleAddNote} isLoading={savingNote} className="mt-2">
                      Save note
                    </Button>
                  </div>
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Automation activity</h3>
                </div>
                {automationEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No automation sessions recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {automationEvents.map((session) => (
                      <div key={session._id} className="border border-border/60 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">
                              {session.automationName || session.templateName || 'Automation session'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {session.automationName && session.templateName
                                ? `Template: ${session.templateName}`
                                : `Session ${session._id.slice(-6)}`}
                            </p>
                          </div>
                          <Badge variant={automationStatusVariant[session.status] || 'secondary'}>
                            {session.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-2">
                          Started {formatDateTime(session.createdAt)} | Updated {formatDateTime(session.updatedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Conversation timeline</h3>
                </div>
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages recorded yet.</p>
                ) : (
                  <div className="space-y-3 max-h-[320px] overflow-y-auto">
                    {messages.map((message) => (
                      <div
                        key={message._id}
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${message.from === 'customer'
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
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CRM;
