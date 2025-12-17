import { useEffect, useState } from 'react';
import { LifeBuoy, MessageSquare, RefreshCw, Tag } from 'lucide-react';
import SupportTicketModal from '../components/SupportTicketModal';
import { supportAPI, SupportTicket, SupportTicketComment } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

export default function Support() {
  const { currentWorkspace } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [comments, setComments] = useState<SupportTicketComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      fetchTickets();
    }
  }, [currentWorkspace]);

  const fetchTickets = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { tickets } = await supportAPI.list({ workspaceId: currentWorkspace._id });
      setTickets(tickets);
      if (tickets.length > 0) {
        loadTicket(tickets[0]._id);
      } else {
        setSelectedTicket(null);
        setComments([]);
      }
    } catch (error) {
      console.error('Failed to load tickets', error);
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

  const addComment = async () => {
    if (!selectedTicket || !commentText.trim()) return;
    setCommenting(true);
    try {
      const newComment = await supportAPI.comment(selectedTicket._id, { message: commentText });
      setComments((prev) => [...prev, newComment]);
      setCommentText('');
    } catch (error) {
      console.error('Failed to add comment', error);
    } finally {
      setCommenting(false);
    }
  };

  const statusBadge = (status: SupportTicket['status']) => {
    const colors: Record<SupportTicket['status'], string> = {
      open: 'bg-blue-100 text-blue-700',
      triage: 'bg-amber-100 text-amber-700',
      needs_user: 'bg-orange-100 text-orange-700',
      in_progress: 'bg-purple-100 text-purple-700',
      resolved: 'bg-green-100 text-green-700',
      closed: 'bg-gray-100 text-gray-700',
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status]}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Support</p>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-primary" />
            Need help?
          </h1>
          <p className="text-muted-foreground">Create tickets and track replies for your workspace.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={fetchTickets} leftIcon={<RefreshCw className="w-4 h-4" />}>
            Refresh
          </Button>
          <Button onClick={() => setShowModal(true)} leftIcon={<MessageSquare className="w-4 h-4" />}>
            Create ticket
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Tickets</h3>
          <div className="border border-border rounded-xl divide-y divide-border bg-card">
            {loading && <p className="p-4 text-sm text-muted-foreground">Loading tickets…</p>}
            {!loading && tickets.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No tickets yet. Create your first one.</p>
            )}
            {tickets.map((ticket) => (
              <button
                key={ticket._id}
                onClick={() => loadTicket(ticket._id)}
                className={`w-full text-left p-4 hover:bg-muted transition flex flex-col gap-1 ${
                  selectedTicket?._id === ticket._id ? 'bg-primary/5 border-l-2 border-primary' : ''
                }`}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold capitalize">{ticket.type}</span>
                  {statusBadge(ticket.status)}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Tag className="w-3 h-3" />
                  <span>{ticket.severity || 'medium'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="border border-border rounded-xl bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ticket</p>
                  <h2 className="text-xl font-bold">{selectedTicket.description}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    {statusBadge(selectedTicket.status)}
                    <span className="text-xs text-muted-foreground">Severity: {selectedTicket.severity || 'medium'}</span>
                    <span className="text-xs text-muted-foreground">Type: {selectedTicket.type}</span>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setShowModal(true)}>
                  Add more details
                </Button>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-muted-foreground">Comments</p>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {comments.length === 0 && (
                    <p className="text-sm text-muted-foreground">No replies yet. Add more details below.</p>
                  )}
                  {comments.map((comment) => (
                    <div key={comment._id} className="border border-border rounded-lg p-3 bg-muted/50">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-semibold capitalize">{comment.authorType}</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-line">{comment.message}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-muted-foreground">Add a comment</label>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={3}
                    className="w-full border border-border rounded-lg px-3 py-2 bg-background"
                    placeholder="Add more details or respond to the team"
                  />
                  <Button onClick={addComment} disabled={commenting}>
                    {commenting ? 'Sending…' : 'Post comment'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-xl p-6 text-center text-muted-foreground">
              Select a ticket to view details.
            </div>
          )}
        </div>
      </div>

      <SupportTicketModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
