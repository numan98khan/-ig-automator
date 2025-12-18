import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LifeBuoy, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import { supportAPI } from '../services/api';
import { getBreadcrumbs, getRecentRequestIds, recordBreadcrumb } from '../services/diagnostics';
import { Button } from './ui/Button';

interface SupportTicketModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: 'bug' | 'support' | 'feature' | 'billing';
  defaultSeverity?: 'low' | 'medium' | 'high' | 'blocking';
  presetMessage?: string;
}

const TYPE_OPTIONS = [
  { value: 'bug', label: 'Bug' },
  { value: 'support', label: 'Support' },
  { value: 'feature', label: 'Feature request' },
  { value: 'billing', label: 'Billing' },
];

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'blocking', label: 'Blocking' },
];

export default function SupportTicketModal({
  open,
  onClose,
  defaultType = 'support',
  defaultSeverity = 'medium',
  presetMessage = '',
}: SupportTicketModalProps) {
  const location = useLocation();
  const { currentWorkspace, user } = useAuth();
  const { activeAccount } = useAccountContext();

  const [type, setType] = useState(defaultType);
  const [severity, setSeverity] = useState(defaultSeverity);
  const [message, setMessage] = useState(presetMessage);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setSeverity(defaultSeverity);
      setMessage(presetMessage);
      setIncludeDetails(true);
      setAdvancedOpen(false);
      setError(null);
      setSuccessId(null);
      recordBreadcrumb({ type: 'action', label: 'opened_support_modal', meta: { path: location.pathname } });
    }
  }, [open, defaultType, defaultSeverity, presetMessage, location.pathname]);

  const contextDetails = useMemo(() => {
    if (!includeDetails) return undefined;

    return {
      route: location.pathname,
      currentUrl: window.location.href,
      workspaceId: currentWorkspace?._id,
      workspaceName: currentWorkspace?.name,
      instagramAccountId: activeAccount?._id,
      instagramHandle: activeAccount?.username,
      user: {
        id: user?.id,
        email: user?.email,
        role: user?.role,
      },
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      requestIds: getRecentRequestIds(),
      breadcrumbs: getBreadcrumbs(),
      submittedAt: new Date().toISOString(),
    };
  }, [includeDetails, location.pathname, currentWorkspace, activeAccount, user]);

  const handleSubmit = async () => {
    if (!currentWorkspace) {
      setError('Workspace missing');
      return;
    }
    if (!message.trim()) {
      setError('Please describe what went wrong');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const ticket = await supportAPI.create({
        workspaceId: currentWorkspace._id,
        instagramAccountId: activeAccount?._id,
        type,
        severity,
        message,
        context: contextDetails,
      });
      setSuccessId(ticket._id);
      recordBreadcrumb({ type: 'action', label: 'submitted_support_ticket', meta: { ticketId: ticket._id } });
    } catch (err: any) {
      console.error('Failed to submit support ticket', err);
      setError(err?.response?.data?.error || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <LifeBuoy className="w-5 h-5 text-primary" />
            <div>
              <p className="text-lg font-semibold">Report an issue</p>
              <p className="text-sm text-muted-foreground">Share what happened — we auto-attach context.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground px-2 py-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm font-medium text-muted-foreground space-y-1">
              Type
              <select
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-muted-foreground space-y-1">
              Severity <span className="text-xs text-muted-foreground">(optional)</span>
              <select
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as typeof severity)}
              >
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-muted-foreground space-y-1">
              Include technical details
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(e) => setIncludeDetails(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-xs text-muted-foreground">Recent logs, request IDs, device</span>
              </div>
            </label>
          </div>

          <label className="text-sm font-medium text-muted-foreground space-y-2 block">
            What went wrong?
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Describe the issue, steps, or what you expected to happen."
              className="w-full border border-border rounded-xl px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>

          <button
            className="text-sm text-primary flex items-center gap-2"
            onClick={() => setAdvancedOpen(!advancedOpen)}
          >
            <span className="inline-block w-5 text-center">{advancedOpen ? '▾' : '▸'}</span>
            Add details
          </button>

          {advancedOpen && (
            <div className="border border-border rounded-xl p-4 bg-muted/40 space-y-3">
              <p className="text-sm font-semibold">Attached context (auto)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div>
                  <p><span className="font-medium text-foreground">Route:</span> {location.pathname}</p>
                  <p><span className="font-medium text-foreground">Workspace:</span> {currentWorkspace?.name || 'Unknown'}</p>
                  <p><span className="font-medium text-foreground">Account:</span> {activeAccount?.username || 'N/A'}</p>
                </div>
                <div>
                  <p><span className="font-medium text-foreground">Timezone:</span> {contextDetails?.timezone}</p>
                  <p><span className="font-medium text-foreground">Browser:</span> {contextDetails?.browser?.userAgent}</p>
                  <p><span className="font-medium text-foreground">Last request IDs:</span> {contextDetails?.requestIds?.slice(-3).join(', ') || '—'}</p>
                </div>
              </div>
            </div>
          )}

          {error && <div className="text-sm text-red-500">{error}</div>}

          {successId ? (
            <div className="border border-green-500/40 bg-green-500/10 text-green-600 rounded-lg px-4 py-3 text-sm flex items-center justify-between">
              <div>
                <p className="font-semibold">Ticket submitted!</p>
                <p className="text-muted-foreground text-xs">ID: {successId}. We’ll follow up shortly.</p>
              </div>
              <Button variant="ghost" onClick={onClose}>
                Back to app
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="text-xs text-muted-foreground">We collect route, workspace, browser, and recent request IDs automatically.</div>
              <Button onClick={handleSubmit} disabled={submitting} leftIcon={<Send className="w-4 h-4" />}>
                {submitting ? 'Sending…' : 'Submit ticket'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
