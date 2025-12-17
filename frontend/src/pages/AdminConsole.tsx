import { useEffect, useState } from 'react';
import { Filter, LayoutDashboard, ShieldCheck, Sparkles } from 'lucide-react';
import { supportAPI, SupportTicket, SupportTicketComment } from '../services/api';
import SupportTicketModal from '../components/SupportTicketModal';
import { Button } from '../components/ui/Button';

const statusOptions: SupportTicket['status'][] = ['open', 'triage', 'needs_user', 'in_progress', 'resolved', 'closed'];
const severityOptions: Array<SupportTicket['severity']> = ['low', 'medium', 'high', 'blocking'];
const typeOptions: Array<SupportTicket['type']> = ['bug', 'support', 'feature', 'billing'];

export default function AdminConsole() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [comments, setComments] = useState<SupportTicketComment[]>([]);
  const [filters, setFilters] = useState({ status: '', type: '', severity: '' });
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, [filters]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const { tickets } = await supportAPI.list({ ...filters });
      setTickets(tickets);
      if (tickets.length > 0) {
        loadTicket(tickets[0]._id);
      }
    } catch (error) {
      console.error('Failed to load admin tickets', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTicket = async (ticketId: string) => {
    try {
      const { ticket, comments } = await supportAPI.getById(ticketId);
      setSelectedTicket(ticket);
      setComments(comments);
    } catch (error) {
      console.error('Failed to load ticket detail', error);
    }
  };

  const updateStatus = async (ticketId: string, status: SupportTicket['status']) => {
    try {
      const updated = await supportAPI.update(ticketId, { status });
      setSelectedTicket((prev) => (prev?._id === ticketId ? updated : prev));
      setTickets((prev) => prev.map((t) => (t._id === ticketId ? updated : t)));
    } catch (error) {
      console.error('Failed to update status', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Support & Health
          </h1>
          <p className="text-muted-foreground">Monitor tickets across all workspaces.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={fetchTickets} leftIcon={<LayoutDashboard className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button onClick={() => setShowModal(true)} leftIcon={<Sparkles className="w-4 h-4" />}>
            Create ticket
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl p-4 bg-card space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Filter className="w-4 h-4" />
            Filters
          </div>
          <select
            className="border border-border rounded-lg px-2 py-1"
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="">Status</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="border border-border rounded-lg px-2 py-1"
            value={filters.type}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="">Type</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            className="border border-border rounded-lg px-2 py-1"
            value={filters.severity}
            onChange={(e) => setFilters((prev) => ({ ...prev, severity: e.target.value }))}
          >
            <option value="">Severity</option>
            {severityOptions.map((option) => (
              <option key={option} value={option || ''}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-border rounded-xl divide-y divide-border bg-background">
            {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {!loading && tickets.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No tickets found for these filters.</p>
            )}
            {tickets.map((ticket) => (
              <button
                key={ticket._id}
                onClick={() => loadTicket(ticket._id)}
                className={`w-full text-left p-4 hover:bg-muted transition ${
                  selectedTicket?._id === ticket._id ? 'bg-primary/5 border-l-2 border-primary' : ''
                }`}
              >
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold">{ticket.description}</p>
                    <p className="text-xs text-muted-foreground">{ticket.workspaceId}</p>
                  </div>
                  <span className="text-xs capitalize text-muted-foreground">{ticket.type}</span>
                </div>
                <div className="text-xs text-muted-foreground flex gap-2 mt-1">
                  <span>Severity: {ticket.severity}</span>
                  <span>Status: {ticket.status}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="border border-border rounded-xl bg-background p-4 space-y-3 min-h-[240px]">
            {selectedTicket ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ticket</p>
                    <h3 className="text-lg font-semibold">{selectedTicket.description}</h3>
                    <p className="text-xs text-muted-foreground">Workspace: {selectedTicket.workspaceId}</p>
                  </div>
                  <select
                    className="border border-border rounded-lg px-2 py-1 text-sm"
                    value={selectedTicket.status}
                    onChange={(e) => updateStatus(selectedTicket._id, e.target.value as SupportTicket['status'])}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-muted-foreground border-t border-border pt-3">
                  <p>Type: {selectedTicket.type}</p>
                  <p>Severity: {selectedTicket.severity}</p>
                  <p>Tags: {selectedTicket.tags?.join(', ') || 'None'}</p>
                  <p>Last request IDs: {selectedTicket.requestIds?.slice(-3).join(', ') || '—'}</p>
                </div>
                <div className="space-y-2 border-t border-border pt-3 max-h-40 overflow-y-auto">
                  {comments.map((comment) => (
                    <div key={comment._id} className="text-sm border border-border rounded-lg p-2 bg-muted/40">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="capitalize">{comment.authorType}</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-foreground">{comment.message}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a ticket to inspect details.</p>
            )}
          </div>
        </div>
      </div>

      <SupportTicketModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
