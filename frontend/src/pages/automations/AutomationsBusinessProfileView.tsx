import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Globe, ListChecks, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { settingsAPI, WorkspaceSettings } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';

type TabId = 'general' | 'catalog' | 'website' | 'documents';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'General', icon: <Settings className="w-4 h-4" /> },
  { id: 'catalog', label: 'Catalog', icon: <ListChecks className="w-4 h-4" /> },
  { id: 'website', label: 'Website', icon: <Globe className="w-4 h-4" /> },
  { id: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
];

type CatalogItem = {
  name: string;
  description?: string;
  price?: string;
};

type DocumentItem = {
  title: string;
  url?: string;
};

export const AutomationsBusinessProfileView: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    businessName: '',
    businessDescription: '',
    businessHours: '',
    businessTone: '',
    businessLocation: '',
    businessWebsite: '',
  });
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const data = await settingsAPI.getByWorkspace(currentWorkspace._id);
        if (cancelled) return;
        setFormState({
          businessName: data.businessName || '',
          businessDescription: data.businessDescription || '',
          businessHours: data.businessHours || '',
          businessTone: data.businessTone || '',
          businessLocation: data.businessLocation || '',
          businessWebsite: data.businessWebsite || '',
        });
        setCatalog(data.businessCatalog || []);
        setDocuments(data.businessDocuments || []);
      } catch (err) {
        console.error('Failed to load business profile settings', err);
      }
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace]);

  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'catalog':
        return (
          <div className="space-y-4">
            {catalog.length === 0 && (
              <div className="text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg p-4">
                Add your first service or product to help the assistant answer customer questions.
              </div>
            )}
            {catalog.map((item, index) => (
              <div key={`${item.name}-${index}`} className="grid grid-cols-1 md:grid-cols-[1.2fr,1.5fr,0.6fr,auto] gap-3">
                <Input
                  value={item.name}
                  onChange={(event) => {
                    const next = [...catalog];
                    next[index] = { ...next[index], name: event.target.value };
                    setCatalog(next);
                  }}
                  placeholder="Service or product name"
                />
                <Input
                  value={item.description || ''}
                  onChange={(event) => {
                    const next = [...catalog];
                    next[index] = { ...next[index], description: event.target.value };
                    setCatalog(next);
                  }}
                  placeholder="Short description"
                />
                <Input
                  value={item.price || ''}
                  onChange={(event) => {
                    const next = [...catalog];
                    next[index] = { ...next[index], price: event.target.value };
                    setCatalog(next);
                  }}
                  placeholder="Price"
                />
                <Button
                  variant="ghost"
                  onClick={() => {
                    const next = [...catalog];
                    next.splice(index, 1);
                    setCatalog(next);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setCatalog([...catalog, { name: '', description: '', price: '' }])}
            >
              Add service or product
            </Button>
          </div>
        );
      case 'website':
        return (
          <div className="space-y-4">
            <Input
              value={formState.businessWebsite}
              onChange={(event) => setFormState((prev) => ({ ...prev, businessWebsite: event.target.value }))}
              placeholder="Website URL"
            />
            <div className="text-xs text-muted-foreground">
              Use a live site or booking page so your automations can direct customers accurately.
            </div>
          </div>
        );
      case 'documents':
        return (
          <div className="space-y-4">
            {documents.length === 0 && (
              <div className="text-sm text-muted-foreground border border-dashed border-border/60 rounded-lg p-4">
                Add documents like menus, pricing sheets, or policies for quick reference.
              </div>
            )}
            {documents.map((item, index) => (
              <div key={`${item.title}-${index}`} className="grid grid-cols-1 md:grid-cols-[1.2fr,1.8fr,auto] gap-3">
                <Input
                  value={item.title}
                  onChange={(event) => {
                    const next = [...documents];
                    next[index] = { ...next[index], title: event.target.value };
                    setDocuments(next);
                  }}
                  placeholder="Document title"
                />
                <Input
                  value={item.url || ''}
                  onChange={(event) => {
                    const next = [...documents];
                    next[index] = { ...next[index], url: event.target.value };
                    setDocuments(next);
                  }}
                  placeholder="Document URL"
                />
                <Button
                  variant="ghost"
                  onClick={() => {
                    const next = [...documents];
                    next.splice(index, 1);
                    setDocuments(next);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => setDocuments([...documents, { title: '', url: '' }])}
            >
              Add document
            </Button>
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                value={formState.businessName}
                onChange={(event) => setFormState((prev) => ({ ...prev, businessName: event.target.value }))}
                placeholder="Business name"
              />
              <Input
                value={formState.businessHours}
                onChange={(event) => setFormState((prev) => ({ ...prev, businessHours: event.target.value }))}
                placeholder="Working hours"
              />
              <Input
                value={formState.businessTone}
                onChange={(event) => setFormState((prev) => ({ ...prev, businessTone: event.target.value }))}
                placeholder="Tone (e.g. Friendly, Luxury)"
              />
              <Input
                value={formState.businessLocation}
                onChange={(event) => setFormState((prev) => ({ ...prev, businessLocation: event.target.value }))}
                placeholder="Location"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Business description</label>
              <textarea
                value={formState.businessDescription}
                onChange={(event) => setFormState((prev) => ({ ...prev, businessDescription: event.target.value }))}
                className="w-full min-h-[120px] bg-secondary/50 border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="Describe your business, audience, and what makes you unique."
              />
            </div>
          </div>
        );
    }
  }, [activeTab, catalog, documents, formState]);

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Partial<WorkspaceSettings> = {
        businessName: formState.businessName,
        businessDescription: formState.businessDescription,
        businessHours: formState.businessHours,
        businessTone: formState.businessTone,
        businessLocation: formState.businessLocation,
        businessWebsite: formState.businessWebsite,
        businessCatalog: catalog,
        businessDocuments: documents,
      };
      await settingsAPI.update(currentWorkspace._id, payload);
      setSuccess('Business profile saved.');
    } catch (err) {
      console.error('Failed to save business profile', err);
      setError('Unable to save business profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Business Profile</h2>
          <p className="text-sm text-muted-foreground">
            Provide the essentials so automations can answer confidently.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-400">
          {success}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle className="text-lg">Profile details</CardTitle>
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tabContent}
        </CardContent>
      </Card>
    </div>
  );
};
