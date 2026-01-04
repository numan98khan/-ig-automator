import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { knowledgeAPI, KnowledgeItem } from '../services/api';
import {
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  Loader2,
  Search,
  AlertCircle,
  FileText,
  Calendar,
  Clock,
  Sparkles,
  Database,
  Upload,
  Power,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

type KnowledgeCategory = 'All' | 'Pricing' | 'Policies' | 'FAQ' | 'Shipping' | 'General';
type StorageFilter = 'all' | 'vector' | 'text';

const Knowledge: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [storageMode, setStorageMode] = useState<'vector' | 'text'>('vector');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<KnowledgeCategory>('All');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspace) {
      loadKnowledge();
    }
  }, [currentWorkspace]);

  const loadKnowledge = async () => {
    if (!currentWorkspace) return;

    try {
      setInitialLoading(true);
      const data = await knowledgeAPI.getByWorkspace(currentWorkspace._id);
      setItems(data);
      setError(null);
    } catch (error) {
      console.error('Error loading knowledge:', error);
      setError('Failed to load knowledge items');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;

    setLoading(true);
    setError(null);
    try {
      if (editingItem) {
        await knowledgeAPI.update(editingItem._id, { title, content, storageMode });
      } else {
        await knowledgeAPI.create(title, content, currentWorkspace._id, storageMode);
      }

      handleCloseModal();
      loadKnowledge();
    } catch (error) {
      console.error('Error saving knowledge:', error);
      setError('Failed to save knowledge item');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item?: KnowledgeItem) => {
    if (item) {
      setEditingItem(item);
      setIsPreviewMode(false);
      setTitle(item.title);
      setContent(item.content);
      setStorageMode(item.storageMode || 'vector');
    } else {
      setEditingItem(null);
      setIsPreviewMode(false);
      setTitle('');
      setContent('');
      setStorageMode('vector');
    }
    setIsModalOpen(true);
    setError(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setIsPreviewMode(false);
    setTitle('');
    setContent('');
    setStorageMode('vector');
    setError(null);
  };

  const handlePreview = (item: KnowledgeItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingItem(item);
    setIsPreviewMode(true);
    setTitle(item.title);
    setContent(item.content);
    setStorageMode(item.storageMode || 'vector');
    setIsModalOpen(true);
    setError(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this knowledge item?')) return;

    try {
      await knowledgeAPI.delete(id);
      setItems(prev => prev.filter(item => item._id !== id));
    } catch (error) {
      console.error('Error deleting knowledge:', error);
      setError('Failed to delete knowledge item');
    }
  };

  const handleToggleActive = async (item: KnowledgeItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const isActive = item.active !== false;
    try {
      setStatusUpdatingId(item._id);
      const updated = await knowledgeAPI.setActive(item._id, !isActive);
      setItems(prev => prev.map(entry => (entry._id === item._id ? updated : entry)));
      setError(null);
    } catch (error) {
      console.error('Error updating knowledge status:', error);
      setError('Failed to update knowledge status');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const getCategory = (item: KnowledgeItem): KnowledgeCategory => {
    const haystack = `${item.title} ${item.content}`.toLowerCase();
    if (/(price|pricing|cost|quote|rate)/.test(haystack)) return 'Pricing';
    if (/(refund|return|exchange|policy|terms|cancellation)/.test(haystack)) return 'Policies';
    if (/(faq|question|answer|support)/.test(haystack)) return 'FAQ';
    if (/(ship|delivery|pickup|dispatch)/.test(haystack)) return 'Shipping';
    return 'General';
  };

  const relativeTime = (dateValue?: string) => {
    if (!dateValue) return 'Recently updated';
    const date = new Date(dateValue);
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Updated today';
    if (diffDays === 1) return 'Updated yesterday';
    if (diffDays < 30) return `Updated ${diffDays} days ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `Updated ${diffMonths} mo ago`;
  };

  const summaryStats = useMemo(() => {
    const total = items.length;
    const ragCount = items.filter((item) => (item.storageMode || 'vector') === 'vector').length;
    const lastUpdatedValue = items
      .map((item) => item.updatedAt || item.createdAt)
      .filter(Boolean)
      .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] as
      | string
      | undefined;
    return {
      total,
      ragCount,
      lastUpdated: lastUpdatedValue ? new Date(lastUpdatedValue).toLocaleDateString() : '—',
    };
  }, [items]);

  const filteredItems = items.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query
      || item.title.toLowerCase().includes(query)
      || item.content.toLowerCase().includes(query);
    const matchesStorage = storageFilter === 'all'
      || (item.storageMode || 'vector') === storageFilter;
    const category = getCategory(item);
    const matchesCategory = categoryFilter === 'All' || category === categoryFilter;
    return matchesQuery && matchesStorage && matchesCategory;
  });

  if (!currentWorkspace) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
              <BookOpen className="w-8 h-8" />
              Knowledge Base
            </h1>
            <p className="text-muted-foreground">
              Manage the knowledge your AI assistant uses to answer questions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="relative w-full sm:w-64 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search knowledge..."
                className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-full focus:outline-none focus:ring-2 focus:ring-ring text-sm transition-all"
              />
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <select
                value={storageFilter}
                onChange={(e) => setStorageFilter(e.target.value as StorageFilter)}
                className="rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="all">All sources</option>
                <option value="vector">RAG (pgvector)</option>
                <option value="text">Text only</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as KnowledgeCategory)}
                className="rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                {(['All', 'Pricing', 'Policies', 'FAQ', 'Shipping', 'General'] as KnowledgeCategory[]).map(
                  (category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ),
                )}
              </select>
            </div>
            <Button
              onClick={() => handleOpenModal()}
              leftIcon={<Plus className="w-4 h-4" />}
              className="shadow-md"
            >
              Add Item
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total items</div>
            <div className="text-2xl font-semibold">{summaryStats.total}</div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">RAG indexed</div>
            <div className="text-2xl font-semibold">{summaryStats.ragCount}</div>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Last updated</div>
            <div className="text-2xl font-semibold">{summaryStats.lastUpdated}</div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && !isModalOpen && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-3 text-destructive animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 font-medium text-sm">{error}</span>
        </div>
      )}

      {/* Search and List */}
      <div className="flex-1 flex flex-col">
        {initialLoading ? (
          <div className="flex-1 flex justify-center items-center min-h-[200px]">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-muted rounded-xl bg-muted/5 min-h-[300px]">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              {searchQuery ? 'No results found' : 'No knowledge items'}
            </h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-6">
              {searchQuery
                ? `No items found matching "${searchQuery}"`
                : 'Add FAQs, pricing, and policies so your assistant can answer questions.'}
            </p>
            {!searchQuery && (
              <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
                Create Item
              </Button>
              <Button variant="outline" leftIcon={<Upload className="w-4 h-4" />} disabled>
                Import from file
              </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {filteredItems.map((item) => {
              const isActive = item.active !== false;
              const isUpdating = statusUpdatingId === item._id;
              return (
                <div
                  key={item._id}
                  className={`group relative glass-panel hover:bg-muted/50 border border-border rounded-xl p-5 transition-all duration-200 cursor-pointer hover:shadow-md ${
                    isActive ? '' : 'opacity-70'
                  }`}
                  onClick={() => handlePreview(item)}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-primary/10 text-primary rounded-lg flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">
                          {item.title}
                        </h3>
                        <span className="text-xs text-muted-foreground">{getCategory(item)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold flex-shrink-0 ${
                          (item.storageMode || 'vector') === 'vector'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {(item.storageMode || 'vector') === 'vector' ? (
                          <Sparkles className="w-3 h-3" />
                        ) : (
                          <Database className="w-3 h-3" />
                        )}
                        {(item.storageMode || 'vector') === 'vector' ? 'RAG (pgvector)' : 'Text only'}
                      </span>
                      {!isActive && (
                        <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mb-4 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Knowledge snippet
                  </div>

                  <p className="text-muted-foreground text-sm line-clamp-3 mb-4 h-[60px]">
                    {item.content}
                  </p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {relativeTime(item.updatedAt || item.createdAt)}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={(e) => handleToggleActive(item, e)}
                      disabled={isUpdating}
                      className="flex items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
                    >
                      {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                      {isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(item);
                      }}
                      className="flex items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => handleDelete(item._id, e)}
                      className="flex items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive hover:border-destructive/40"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={
          isPreviewMode
            ? 'Knowledge Preview'
            : editingItem
              ? 'Edit Knowledge'
              : 'Add Knowledge'
        }
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Returns & exchanges"
              autoFocus
              required
              disabled={isPreviewMode}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter detailed information..."
              rows={10}
              className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-y min-h-[150px]"
              required
              disabled={isPreviewMode}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              The AI uses this content to answer questions. Be clear and concise.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Storage target</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStorageMode('vector')}
                className={`w-full text-left border rounded-lg p-3 flex items-start gap-3 transition ${
                  storageMode === 'vector' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50'
                }`}
                disabled={isPreviewMode}
              >
                <div className="p-2 rounded-md bg-primary/10 text-primary">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">RAG (pgvector)</p>
                  <p className="text-xs text-muted-foreground">
                    Store embeddings in Postgres (env.POSTGRES_URL) for semantic search with the assistant.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStorageMode('text')}
                className={`w-full text-left border rounded-lg p-3 flex items-start gap-3 transition ${
                  storageMode === 'text' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50'
                }`}
                disabled={isPreviewMode}
              >
                <div className="p-2 rounded-md bg-muted text-muted-foreground">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Text only (MongoDB)</p>
                  <p className="text-xs text-muted-foreground">
                    Keep the article in Mongo without pgvector; still usable for scripted replies.
                  </p>
                </div>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={handleCloseModal}
            >
              {isPreviewMode ? 'Close' : 'Cancel'}
            </Button>
            {!isPreviewMode && (
              <Button
                type="submit"
                isLoading={loading}
                leftIcon={!loading && <React.Fragment><Plus className="w-4 h-4 hidden" /><Edit2 className="w-4 h-4" /></React.Fragment>}
              >
                {editingItem ? 'Save Changes' : 'Create Item'}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Knowledge;
