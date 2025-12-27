import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  categoriesAPI,
  MessageCategory,
  CategoryKnowledge,
} from '../services/api';
import {
  Tags,
  Plus,
  Trash2,
  Save,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  BookOpen,
  Info
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

export default function Categories() {
  const { currentWorkspace } = useAuth();
  const [categories, setCategories] = useState<MessageCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Selected category for editing knowledge
  const [selectedCategory, setSelectedCategory] = useState<MessageCategory | null>(null);
  const [, setCategoryKnowledge] = useState<CategoryKnowledge | null>(null);
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [savingKnowledge, setSavingKnowledge] = useState(false);

  // New category form
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      loadCategories();
    }
  }, [currentWorkspace]);

  // Real-time polling
  useEffect(() => {
    if (!currentWorkspace) return;

    const interval = setInterval(() => {
      loadCategoriesQuietly();
    }, 10000);

    return () => clearInterval(interval);
  }, [currentWorkspace]);

  const loadCategories = async () => {
    if (!currentWorkspace) return;

    setLoading(true);
    setError(null);

    try {
      const data = await categoriesAPI.getByWorkspace(currentWorkspace._id);
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const loadCategoriesQuietly = async () => {
    if (!currentWorkspace) return;

    try {
      const data = await categoriesAPI.getByWorkspace(currentWorkspace._id);
      setCategories(data);
    } catch (err: any) {
      console.error('Failed to refresh categories:', err);
    }
  };

  const selectCategory = async (category: MessageCategory) => {
    setSelectedCategory(category);
    setKnowledgeContent('');

    try {
      const knowledge = await categoriesAPI.getKnowledge(category._id);
      setCategoryKnowledge(knowledge);
      setKnowledgeContent(knowledge.content || '');
    } catch (err) {
      console.error('Failed to load category knowledge:', err);
    }
  };

  const saveKnowledge = async () => {
    if (!selectedCategory) return;

    setSavingKnowledge(true);
    setError(null);

    try {
      await categoriesAPI.updateKnowledge(selectedCategory._id, knowledgeContent);
      setSuccess('Category knowledge saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save knowledge');
    } finally {
      setSavingKnowledge(false);
    }
  };

  const toggleAutoReply = async (category: MessageCategory) => {
    try {
      const updated = await categoriesAPI.update(category._id, {
        autoReplyEnabled: !category.autoReplyEnabled,
      });

      setCategories(prev =>
        prev.map(c => (c._id === updated._id ? updated : c))
      );

      if (selectedCategory?._id === category._id) {
        setSelectedCategory(updated);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update category');
    }
  };

  const createCategory = async () => {
    if (!currentWorkspace || !newCategoryName.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const created = await categoriesAPI.create(
        currentWorkspace._id,
        newCategoryName.trim(),
        newCategoryDescription.trim() || undefined
      );

      setCategories(prev => [...prev, created]);
      setNewCategoryName('');
      setNewCategoryDescription('');
      setShowNewCategoryForm(false);
      setSuccess('Category created successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  const deleteCategory = async (category: MessageCategory) => {
    if (category.isSystem) {
      setError('Cannot delete system categories');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${category.nameEn}"? Messages will be moved to "General".`)) {
      return;
    }

    try {
      await categoriesAPI.delete(category._id);
      setCategories(prev => prev.filter(c => c._id !== category._id));

      if (selectedCategory?._id === category._id) {
        setSelectedCategory(null);
        setCategoryKnowledge(null);
      }

      setSuccess('Category deleted successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2 mb-2">
          Categories
        </h1>
        <p className="text-muted-foreground">
          Manage message categories and train AI on how to respond to each topic.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 dark:text-red-400 animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 font-medium text-sm">{error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0 hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 text-green-600 dark:text-green-400 animate-fade-in">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 font-medium text-sm">{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="h-full flex flex-col border-border bg-background/50 backdrop-blur-md">
            <CardHeader className="border-b border-border pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-foreground">All Categories</CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowNewCategoryForm(true)}
                  className="h-8 w-8 p-0 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
              {/* New Category Form */}
              {showNewCategoryForm && (
                <div className="p-4 border-b border-border bg-muted/30 animate-slide-up">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="mb-2 bg-background border-input text-foreground placeholder-muted-foreground"
                    autoFocus
                  />
                  <Input
                    value={newCategoryDescription}
                    onChange={(e) => setNewCategoryDescription(e.target.value)}
                    placeholder="Brief description"
                    className="mb-3 bg-background border-input text-foreground placeholder-muted-foreground"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={createCategory}
                      disabled={creating || !newCategoryName.trim()}
                      isLoading={creating}
                      className="flex-1"
                    >
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowNewCategoryForm(false);
                        setNewCategoryName('');
                        setNewCategoryDescription('');
                      }}
                      className="bg-background text-foreground hover:bg-muted"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* List */}
              <div className="overflow-y-auto max-h-[calc(100vh-300px)] custom-scrollbar p-2 space-y-1">
                {categories.map(category => (
                  <div
                    key={category._id}
                    onClick={() => selectCategory(category)}
                    className={`group w-full text-left p-3 rounded-xl transition-all border cursor-pointer relative ${selectedCategory?._id === category._id
                      ? 'bg-primary/5 border-primary/20 shadow-sm'
                      : 'bg-transparent border-transparent hover:bg-muted hover:border-border/50'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium truncate ${selectedCategory?._id === category._id ? 'text-foreground' : 'text-foreground/80'}`}>
                            {category.nameEn}
                          </span>
                          {category.isSystem && (
                            <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-muted text-muted-foreground">System</Badge>
                          )}
                        </div>
                        {category.description && (
                          <div className="text-xs text-muted-foreground truncate mb-2">
                            {category.description}
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MessageSquare className="w-3 h-3" />
                            {category.messageCount}
                          </div>
                          <div className={`text-[10px] px-1.5 py-0.5 rounded-full border ${category.autoReplyEnabled
                            ? 'bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400'
                            : 'bg-muted border-border text-muted-foreground'
                            }`}>
                            {category.autoReplyEnabled ? 'Auto-reply On' : 'Off'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleAutoReply(category);
                          }}
                          className={`h-6 w-6 p-0 rounded-lg ${category.autoReplyEnabled ? 'text-green-600 dark:text-green-400 hover:bg-green-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                          title="Toggle Auto-reply"
                        >
                          <div className={`w-2 h-2 rounded-full ${category.autoReplyEnabled ? 'bg-green-500 shadow-sm' : 'bg-muted-foreground'}`} />
                        </Button>

                        {!category.isSystem && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteCategory(category);
                            }}
                            className="h-6 w-6 p-0 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2">
          {selectedCategory ? (
            <Card className="h-full flex flex-col bg-background/50 backdrop-blur-md border border-border">
              <CardHeader className="border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Tags className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-foreground">{selectedCategory.nameEn}</CardTitle>
                    <p className="text-xs text-muted-foreground">Define AI behavior for this category</p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="mb-6 flex-1">
                  <label className="block text-sm font-medium text-foreground mb-3 flex items-center justify-between">
                    Response Instructions
                    <span className="text-xs font-normal text-muted-foreground">Markdown supported</span>
                  </label>
                  <div className="relative h-full min-h-[400px]">
                    <textarea
                      value={knowledgeContent}
                      onChange={(e) => setKnowledgeContent(e.target.value)}
                      className="w-full h-full absolute inset-0 bg-secondary/50 border border-input rounded-xl p-4 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none leading-relaxed custom-scrollbar placeholder:text-muted-foreground"
                      placeholder={`# Instructions for ${selectedCategory.nameEn}\n\n- Be polite but direct\n- If they ask for pricing, refer to /pricing\n- Escalation needed for complex technical issues`}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-lg border border-border">
                      <span className={`w-2 h-2 rounded-full ${selectedCategory.autoReplyEnabled ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                      {selectedCategory.autoReplyEnabled ? 'Auto-reply Active' : 'Auto-reply Paused'}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleAutoReply(selectedCategory)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {selectedCategory.autoReplyEnabled ? 'Pause' : 'Enable'}
                    </Button>
                  </div>

                  <Button
                    onClick={saveKnowledge}
                    disabled={savingKnowledge}
                    isLoading={savingKnowledge}
                    leftIcon={!savingKnowledge && <Save className="w-4 h-4" />}
                    className="min-w-[140px]"
                  >
                    Save Instructions
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center p-12 border-dashed border-border bg-transparent">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Select a Category</h3>
                <p className="text-muted-foreground text-sm">
                  Choose a category from the list to edit its specific AI response instructions and knowledge base.
                </p>
              </div>
            </Card>
          )}

          {/* Help Tip */}
          {selectedCategory && (
            <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl flex gap-3 text-blue-600 dark:text-blue-400">
              <Info className="w-5 h-5 flex-shrink-0" />
              <div className="text-xs space-y-1">
                <p className="font-medium">Pro Tip:</p>
                <p className="opacity-80">
                  Use specific examples in your instructions. For example: "If user asks X, say Y." This helps the AI understand the exact tone and content you want.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
