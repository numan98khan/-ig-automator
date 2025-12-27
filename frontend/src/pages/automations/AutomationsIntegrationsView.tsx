import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle, RefreshCw, FileSpreadsheet, ExternalLink, Link2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  GoogleSheetsIntegration,
  InventoryMapping,
  InventoryMappingEntry,
  InventoryMappingField,
  integrationsAPI,
  settingsAPI,
} from '../../services/api';

const DEFAULT_CONFIG: GoogleSheetsIntegration = {
  enabled: false,
  spreadsheetId: '',
  sheetName: 'Sheet1',
  headerRow: 1,
};

const INVENTORY_FIELDS: Array<{ key: InventoryMappingField; label: string; hint: string }> = [
  { key: 'productName', label: 'Product name', hint: 'Product title or name.' },
  { key: 'sku', label: 'SKU', hint: 'Unique identifier or SKU code.' },
  { key: 'description', label: 'Description', hint: 'Long or short description.' },
  { key: 'price', label: 'Price', hint: 'Selling price or MSRP.' },
  { key: 'quantity', label: 'Quantity', hint: 'Inventory count or stock on hand.' },
  { key: 'variant', label: 'Variant', hint: 'Size, color, or variant info.' },
  { key: 'category', label: 'Category', hint: 'Category or product type.' },
  { key: 'brand', label: 'Brand', hint: 'Brand or manufacturer.' },
  { key: 'imageUrl', label: 'Image URL', hint: 'Primary product image URL.' },
  { key: 'location', label: 'Location', hint: 'Warehouse or bin location.' },
  { key: 'status', label: 'Status', hint: 'Active, inactive, in-stock, etc.' },
  { key: 'cost', label: 'Cost', hint: 'Cost of goods or wholesale cost.' },
  { key: 'barcode', label: 'Barcode', hint: 'UPC, EAN, or barcode.' },
];

type NormalizedInventoryMapping = InventoryMapping & {
  fields: Record<InventoryMappingField, InventoryMappingEntry>;
};

const buildEmptyMapping = (): NormalizedInventoryMapping => ({
  fields: INVENTORY_FIELDS.reduce((acc, field) => {
    acc[field.key] = {};
    return acc;
  }, {} as Record<InventoryMappingField, InventoryMappingEntry>),
});

const normalizeMapping = (mapping?: InventoryMapping): NormalizedInventoryMapping => {
  const base = buildEmptyMapping();
  if (!mapping?.fields) return base;
  INVENTORY_FIELDS.forEach((field) => {
    if (mapping.fields?.[field.key]) {
      base.fields[field.key] = mapping.fields[field.key];
    }
  });
  return {
    ...base,
    ...mapping,
    fields: base.fields,
  };
};

export const AutomationsIntegrationsView: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [formData, setFormData] = useState<GoogleSheetsIntegration>(DEFAULT_CONFIG);
  const [lastTest, setLastTest] = useState<Pick<GoogleSheetsIntegration, 'lastTestedAt' | 'lastTestStatus' | 'lastTestMessage'>>({});
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][]; range: string } | null>(null);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthEmail, setOauthEmail] = useState<string | null>(null);
  const [sheetFiles, setSheetFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspace) {
      loadSettings();
    }
  }, [currentWorkspace]);

  useEffect(() => {
    const status = searchParams.get('googleSheets');
    if (status === 'connected') {
      setSuccess('Google Sheets connected successfully.');
      setSearchParams({ section: 'integrations' });
      loadSettings().then(() => handleLoadSheets());
    }
    if (status === 'error') {
      setError('Google Sheets connection failed. Please try again.');
      setSearchParams({ section: 'integrations' });
    }
  }, [searchParams, setSearchParams]);

  const loadSettings = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    setSheetFiles([]);
    setSheetTabs([]);
    setPreview(null);
    try {
      const settings = await settingsAPI.getByWorkspace(currentWorkspace._id);
      const googleSheets = settings.googleSheets || DEFAULT_CONFIG;
      setFormData({
        enabled: googleSheets.enabled ?? false,
        spreadsheetId: googleSheets.spreadsheetId || '',
        sheetName: googleSheets.sheetName || 'Sheet1',
        headerRow: googleSheets.headerRow || 1,
        inventoryMapping: normalizeMapping(googleSheets.inventoryMapping),
      });
      setSpreadsheetInput(googleSheets.spreadsheetId || '');
      setLastTest({
        lastTestedAt: googleSheets.lastTestedAt,
        lastTestStatus: googleSheets.lastTestStatus,
        lastTestMessage: googleSheets.lastTestMessage,
      });
      setOauthConnected(!!googleSheets.oauthConnected);
      setOauthEmail(googleSheets.oauthEmail || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, {
        googleSheets: {
          ...formData,
          ...lastTest,
        },
      });
      setFormData({
        ...(updated.googleSheets || DEFAULT_CONFIG),
        inventoryMapping: normalizeMapping(updated.googleSheets?.inventoryMapping),
      });
      setLastTest({
        lastTestedAt: updated.googleSheets?.lastTestedAt,
        lastTestStatus: updated.googleSheets?.lastTestStatus,
        lastTestMessage: updated.googleSheets?.lastTestMessage,
      });
      setSuccess('Google Sheets integration saved.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save integration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!currentWorkspace) return;
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await integrationsAPI.testGoogleSheets(currentWorkspace._id, formData);
      setPreview(result.preview || null);
      if (result.preview) {
        setLastTest({
          lastTestedAt: new Date().toISOString(),
          lastTestStatus: 'success',
          lastTestMessage: `Fetched ${result.preview.headers.length} header(s) from ${result.preview.range}`,
        });
      }
      setSuccess('Connected and fetched header preview.');
    } catch (err: any) {
      setError(err.message || 'Failed to test Google Sheets');
    } finally {
      setTesting(false);
    }
  };

  const handleAnalyze = async () => {
    if (!currentWorkspace) return;
    setAnalyzing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await integrationsAPI.analyzeGoogleSheets(currentWorkspace._id, formData);
      setPreview(result.preview || null);
      if (result.mapping) {
        setFormData((prev) => ({
          ...prev,
          inventoryMapping: normalizeMapping(result.mapping),
        }));
      }
      setSuccess('AI mapped your sheet columns. Review the mapping below and save.');
    } catch (err: any) {
      setError(err.message || 'Failed to analyze Google Sheets');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleUpdateMapping = (fieldKey: InventoryMappingField, header: string) => {
    setFormData((prev) => {
      const mapping = normalizeMapping(prev.inventoryMapping);
      const nextFields = {
        ...mapping.fields,
        [fieldKey]: {
          ...mapping.fields?.[fieldKey],
          header: header || undefined,
        },
      };
      return {
        ...prev,
        inventoryMapping: {
          ...mapping,
          fields: nextFields,
        },
      };
    });
  };

  const mappingHeaders = preview?.headers
    || formData.inventoryMapping?.sourceHeaders
    || [];

  const handleConnect = async () => {
    if (!currentWorkspace) return;
    setConnecting(true);
    setError(null);
    try {
      const result = await integrationsAPI.getGoogleSheetsAuthUrl(currentWorkspace._id);
      window.location.assign(result.url);
    } catch (err: any) {
      setError(err.message || 'Failed to start Google OAuth');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!currentWorkspace) return;
    setDisconnecting(true);
    setError(null);
    try {
      await integrationsAPI.disconnectGoogleSheets(currentWorkspace._id);
      setOauthConnected(false);
      setOauthEmail(null);
      setSheetFiles([]);
      setSheetTabs([]);
      setSuccess('Google Sheets disconnected.');
      await loadSettings();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect Google Sheets');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleLoadSheets = async () => {
    if (!currentWorkspace) return;
    setLoadingSheets(true);
    setError(null);
    try {
      const result = await integrationsAPI.listGoogleSheetsFiles(currentWorkspace._id);
      setSheetFiles(result.files || []);
      if (result.files?.length === 0) {
        setSuccess('No spreadsheets found in this Google account.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sheets');
    } finally {
      setLoadingSheets(false);
    }
  };

  const parseSpreadsheetId = (value: string) => {
    const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match?.[1]) return match[1];
    const trimmed = value.trim();
    if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) return trimmed;
    return '';
  };

  const loadTabsForSpreadsheet = async (spreadsheetId: string) => {
    if (!currentWorkspace || !spreadsheetId || !oauthConnected) return;
    setLoadingTabs(true);
    setError(null);
    try {
      const result = await integrationsAPI.listGoogleSheetsTabs(currentWorkspace._id, spreadsheetId);
      const tabs = result.tabs || [];
      setSheetTabs(tabs);
      if (tabs.length > 0) {
        setFormData((prev) => ({
          ...prev,
          sheetName: tabs.includes(prev.sheetName || '') ? prev.sheetName : tabs[0],
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sheet tabs');
    } finally {
      setLoadingTabs(false);
    }
  };

  const handleSelectSpreadsheet = async (spreadsheetId: string) => {
    setSpreadsheetInput(spreadsheetId);
    setFormData((prev) => ({ ...prev, spreadsheetId }));
    setSheetTabs([]);
    await loadTabsForSpreadsheet(spreadsheetId);
  };

  const handleSpreadsheetInputChange = (value: string) => {
    setSpreadsheetInput(value);
    const parsed = parseSpreadsheetId(value);
    if (!parsed) {
      setFormData((prev) => ({ ...prev, spreadsheetId: '' }));
      setSheetTabs([]);
      return;
    }
    if (parsed === formData.spreadsheetId) return;
    setFormData((prev) => ({ ...prev, spreadsheetId: parsed }));
    loadTabsForSpreadsheet(parsed);
  };

  if (!currentWorkspace) {
    return <div className="p-4 text-muted-foreground">Select a workspace to manage integrations.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-7 h-7" />
            Integrations
          </h1>
          <p className="text-muted-foreground">
            Connect external tools to automate handoffs and reporting from your automations.
          </p>
        </div>
        <Button variant="outline" onClick={loadSettings} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Refresh
        </Button>
      </div>

      {(error || success) && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-medium ${
          error ? 'bg-destructive/10 border-destructive/20 text-destructive' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
        }`}
        >
          {error ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
          <span>{error || success}</span>
        </div>
      )}

      <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
          <h2 className="text-lg font-semibold text-foreground">Google Sheets</h2>
          <p className="text-sm text-muted-foreground">
            Connect a sheet to read inventory and pricing data for Sales Concierge (read-only access).
          </p>
        </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={!!formData.enabled}
              onChange={(event) => setFormData((prev) => ({ ...prev, enabled: event.target.checked }))}
              className="rounded border-border"
            />
            Enabled
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Link2 className="w-4 h-4" />
            {oauthConnected ? 'Connected' : 'Not connected'}
          </div>
          {oauthEmail && (
            <span className="text-xs text-muted-foreground">({oauthEmail})</span>
          )}
          <div className="ml-auto flex gap-2">
            {!oauthConnected ? (
              <Button variant="outline" onClick={handleConnect} isLoading={connecting}>
                Connect Google Sheets
              </Button>
            ) : (
              <Button variant="outline" onClick={handleDisconnect} isLoading={disconnecting}>
                Disconnect
              </Button>
            )}
            <Button variant="outline" onClick={loadSettings} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleLoadSheets}
                isLoading={loadingSheets}
                disabled={!oauthConnected}
              >
                Load Sheets
              </Button>
              {sheetFiles.length > 0 && (
                <select
                  value={formData.spreadsheetId || ''}
                  onChange={(event) => handleSelectSpreadsheet(event.target.value)}
                  className="flex-1 min-w-[240px] px-3 py-2 bg-background border border-input rounded-md text-sm"
                >
                  <option value="">Select a spreadsheet</option>
                  {sheetFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Input
              label="Spreadsheet URL or ID"
              value={spreadsheetInput}
              onChange={(event) => handleSpreadsheetInputChange(event.target.value)}
              placeholder="Paste Google Sheet URL or ID"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-muted-foreground">Sheet Tab</label>
            {loadingTabs ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading tabs...
              </div>
            ) : sheetTabs.length > 0 ? (
              <select
                value={formData.sheetName || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, sheetName: event.target.value }))}
                className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
              >
                {sheetTabs.map((tab) => (
                  <option key={tab} value={tab}>
                    {tab}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                label="Sheet Tab Name"
                value={formData.sheetName || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, sheetName: event.target.value }))}
                placeholder="Sheet1"
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Input
            label="Header Row Number"
            type="number"
            value={formData.headerRow ?? 1}
            onChange={(event) => {
              const value = Number(event.target.value);
              setFormData((prev) => ({ ...prev, headerRow: Number.isNaN(value) ? 1 : value }));
            }}
            placeholder="1"
          />
          <div className="text-xs text-muted-foreground flex items-center h-full">
            We will read this row to detect column headers for inventory mapping later.
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-muted-foreground">
            {lastTest.lastTestedAt && (
              <div>
                Last test: {new Date(lastTest.lastTestedAt).toLocaleString()} ({lastTest.lastTestStatus || 'unknown'})
              </div>
            )}
            {lastTest.lastTestMessage && (
              <div>{lastTest.lastTestMessage}</div>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleTest}
              isLoading={testing}
              leftIcon={<ExternalLink className="w-4 h-4" />}
              disabled={!oauthConnected || !formData.spreadsheetId}
            >
              Test Connection
            </Button>
            <Button onClick={handleSave} isLoading={saving}>
              Save Integration
            </Button>
          </div>
        </div>

        {preview && (
          <div className="border border-border/60 rounded-xl p-4 bg-muted/30 space-y-3">
            <div className="text-sm font-semibold">Header Preview ({preview.range})</div>
            {preview.headers.length === 0 ? (
              <div className="text-xs text-muted-foreground">No headers detected yet.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {preview.headers.map((header) => (
                  <span key={header} className="px-2 py-1 rounded-full text-xs font-medium bg-background border border-border">
                    {header}
                  </span>
                ))}
              </div>
            )}
            {preview.rows.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Loaded {preview.rows.length} sample row(s).
              </div>
            )}
          </div>
        )}

        <div className="border border-border/60 rounded-xl p-4 bg-muted/30 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Inventory Mapping Wizard</div>
              <p className="text-xs text-muted-foreground">
                Use AI to interpret your headers into inventory fields and keep a saved mapping for future syncs.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleAnalyze}
              isLoading={analyzing}
              disabled={!oauthConnected || !formData.spreadsheetId}
            >
              Analyze with AI
            </Button>
          </div>

          {formData.inventoryMapping?.updatedAt && (
            <div className="text-xs text-muted-foreground">
              Last analyzed: {new Date(formData.inventoryMapping.updatedAt).toLocaleString()}
              {formData.inventoryMapping.sourceRange ? ` · ${formData.inventoryMapping.sourceRange}` : ''}
            </div>
          )}
          {formData.inventoryMapping?.summary && (
            <div className="text-xs text-muted-foreground">
              {formData.inventoryMapping.summary}
            </div>
          )}

          {mappingHeaders.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Run the test or AI analysis to load headers, then map them to inventory fields.
            </div>
          ) : (
            <div className="space-y-3">
              {INVENTORY_FIELDS.map((field) => {
                const entry = formData.inventoryMapping?.fields?.[field.key];
                return (
                  <div key={field.key} className="grid grid-cols-1 md:grid-cols-[180px_1fr_120px] gap-2 items-center">
                    <div className="text-sm font-medium text-foreground">{field.label}</div>
                    <select
                      value={entry?.header || ''}
                      onChange={(event) => handleUpdateMapping(field.key, event.target.value)}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                    >
                      <option value="">Not mapped</option>
                      {mappingHeaders.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-muted-foreground md:text-right">
                      {typeof entry?.confidence === 'number'
                        ? `${Math.round(entry.confidence * 100)}%`
                        : '—'}
                    </div>
                    <div className="md:col-span-3 text-xs text-muted-foreground">
                      {entry?.notes || field.hint}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
