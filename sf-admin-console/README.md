# Admin Console

The Admin Console provides a comprehensive "god eye view" of the entire Instagram automation platform.

## Features

- **Dashboard**: Real-time overview with key metrics and system status
- **Workspaces**: Monitor and manage all workspaces across the platform
- **Conversations**: View all conversations with filtering and search
- **Users**: User management and activity tracking
- **Analytics**: Platform-wide analytics and insights
- **System Health**: Monitor system performance, database stats, and service status

## Getting Started

### Development

The admin console runs on port 3001 by default.

```bash
# From the project root
cd admin-console
npm install
npm run dev
```

Or use the start-dev.sh script from the project root which will start all services:

```bash
./start-dev.sh
```

The admin console will be available at: http://localhost:3001

### Environment Variables

Create a `.env` file based on `.env.example`:

```
VITE_API_URL=http://localhost:5001
```

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query (React Query)
- React Router
- Axios
- Lucide Icons
- Recharts (for future chart visualizations)

## API Endpoints

The admin console connects to backend admin API endpoints at `/api/admin/*`:

- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/system/metrics` - System metrics
- `GET /api/admin/workspaces` - List all workspaces
- `GET /api/admin/users` - List all users
- `GET /api/admin/conversations` - List all conversations
- `GET /api/admin/escalations` - List all escalations
- `GET /api/admin/health` - Health check
- `GET /api/admin/system/database` - Database statistics
- `GET /api/admin/analytics` - Platform analytics

## Pages

### Dashboard (`/`)
- System status banner
- Key metrics (workspaces, users, conversations, escalations)
- Performance metrics (AI response rate, avg response time, etc.)
- Recent escalations
- Top workspaces by activity

### Workspaces (`/workspaces`)
- Grid view of all workspaces
- Search and filter functionality
- Workspace statistics (members, conversations, activity)

### Conversations (`/conversations`)
- List of all conversations across workspaces
- Filter by status (active, resolved, escalated)
- Real-time message count and last message
- Escalation indicators

### Users (`/users`)
- Table view of all platform users
- Search by name or email
- Workspace membership count
- Join date and status

### Analytics (`/analytics`)
- Platform-wide analytics
- User growth, message volume, AI performance
- Top performing workspaces
- Chart visualizations (placeholder for now)

### System Health (`/system-health`)
- Overall system status
- CPU and memory usage
- Database size and collection stats
- Service status and uptime
- Active connections

## Design

The admin console uses a dark Palantir-inspired theme with:
- Clean, professional design
- Consistent color scheme
- Intuitive navigation
- Real-time data updates
- Responsive layout

## Future Enhancements

- [ ] Real-time WebSocket updates for live data
- [ ] Advanced filtering and sorting
- [ ] Export functionality for reports
- [ ] User role management
- [ ] Detailed workspace drill-down views
- [ ] Interactive charts and graphs with Recharts
- [ ] Audit logs and activity tracking
- [ ] Notification system for critical alerts
- [ ] Admin actions (suspend users, delete workspaces, etc.)
