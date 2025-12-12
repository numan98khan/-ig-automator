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
  RefreshCw,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  ToggleLeft,
  ToggleRight,
  BookOpen,
} from 'lucide-react';

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
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Tags className="w-6 h-6" />
          Message Categories
        </h1>
        <p className="text-gray-600 mt-1">
          Manage how different types of messages are categorized and answered.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold">Categories</h2>
              <button
                onClick={() => setShowNewCategoryForm(true)}
                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                title="Add category"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {/* New Category Form */}
            {showNewCategoryForm && (
              <div className="p-4 border-b bg-gray-50">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  className="w-full px-3 py-2 border rounded-lg mb-2"
                  autoFocus
                />
                <input
                  type="text"
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 border rounded-lg mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={createCategory}
                    disabled={creating || !newCategoryName.trim()}
                    className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewCategoryForm(false);
                      setNewCategoryName('');
                      setNewCategoryDescription('');
                    }}
                    className="px-3 py-1.5 border rounded-lg hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Category List */}
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {categories.map(category => (
                <div
                  key={category._id}
                  onClick={() => selectCategory(category)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${
                    selectedCategory?._id === category._id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {category.nameEn}
                        {category.isSystem && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                            System
                          </span>
                        )}
                      </div>
                      {category.description && (
                        <div className="text-sm text-gray-500 mt-0.5">
                          {category.description}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {category.messageCount} messages
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAutoReply(category);
                        }}
                        className={`p-1 rounded ${
                          category.autoReplyEnabled
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        }`}
                        title={category.autoReplyEnabled ? 'Auto-reply enabled' : 'Auto-reply disabled'}
                      >
                        {category.autoReplyEnabled ? (
                          <ToggleRight className="w-5 h-5" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                      </button>

                      {!category.isSystem && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCategory(category);
                          }}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="Delete category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Category Knowledge Editor */}
        <div className="lg:col-span-2">
          {selectedCategory ? (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-500" />
                  Knowledge for "{selectedCategory.nameEn}"
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Define how the AI should respond to messages in this category.
                </p>
              </div>

              <div className="p-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Response Instructions
                  </label>
                  <textarea
                    value={knowledgeContent}
                    onChange={(e) => setKnowledgeContent(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder={`Enter instructions for how the AI should respond to "${selectedCategory.nameEn}" messages.

Example:
- Always greet the customer warmly
- Provide specific pricing information when asked
- If the question is complex, offer to connect them with a team member
- Keep responses concise and professional`}
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    These instructions will be used by the AI when generating responses for messages
                    categorized as "{selectedCategory.nameEn}".
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`px-2 py-1 rounded ${
                      selectedCategory.autoReplyEnabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      Auto-reply: {selectedCategory.autoReplyEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <button
                    onClick={saveKnowledge}
                    disabled={savingKnowledge}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingKnowledge ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Knowledge
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Select a category to edit its knowledge and response instructions.</p>
            </div>
          )}

          {/* Help Section */}
          <div className="mt-6 bg-blue-50 rounded-lg border border-blue-200 p-4">
            <h3 className="font-medium text-blue-800 mb-2">How Categories Work</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Incoming messages are automatically categorized using AI</li>
              <li>• Each category can have its own response instructions</li>
              <li>• Toggle auto-reply per category to control automatic responses</li>
              <li>• System categories cannot be deleted but can be customized</li>
              <li>• Create custom categories for your specific business needs</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
