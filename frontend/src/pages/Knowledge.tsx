import React, { useState, useEffect } from 'react';
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
  Sparkles,
  Database
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

const Knowledge: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [storageMode, setStorageMode] = useState<'vector' | 'text'>('vector');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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
        await knowledgeAPI.update(editingItem._id, title, content, storageMode);
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
      setTitle(item.title);
      setContent(item.content);
      setStorageMode(item.storageMode || 'vector');
    } else {
      setEditingItem(null);
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
    setTitle('');
    setContent('');
    setStorageMode('vector');
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

  const filteredItems = items.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!currentWorkspace) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-2">
            <BookOpen className="w-8 h-8" />
            Knowledge Base
          </h1>
          <p className="text-muted-foreground">
            Manage the knowledge your AI assistant uses to answer questions.
          </p>
        </div>
        <Button
          onClick={() => handleOpenModal()}
          leftIcon={<Plus className="w-4 h-4" />}
          className="shadow-sm"
        >
          Add Item
        </Button>
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
        {items.length > 0 && (
          <div className="mb-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search knowledge..."
              className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm transition-all"
            />
          </div>
        )}

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
                : 'Add knowledge to help your AI answer customer questions.'}
            </p>
            {!searchQuery && (
              <Button onClick={() => handleOpenModal()} leftIcon={<Plus className="w-4 h-4" />}>
                Create Item
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {filteredItems.map((item) => (
              <div
                key={item._id}
                className="group relative glass-panel hover:bg-muted/50 border border-border rounded-xl p-5 transition-all duration-200 cursor-pointer hover:shadow-md"
                onClick={() => handleOpenModal(item)}
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDelete(item._id, e)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <FileText className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-foreground truncate pr-8">
                    {item.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
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
                </div>

                <p className="text-muted-foreground text-sm line-clamp-3 mb-4 h-[60px]">
                  {item.content}
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingItem ? 'Edit Knowledge' : 'Add Knowledge'}
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
              placeholder="e.g., Return Policy"
              autoFocus
              required
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
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={loading}
              leftIcon={!loading && <React.Fragment><Plus className="w-4 h-4 hidden" /><Edit2 className="w-4 h-4" /></React.Fragment>}
            >
              {editingItem ? 'Save Changes' : 'Create Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Knowledge;
