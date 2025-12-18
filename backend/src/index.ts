import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './config/database';

// Import routes
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import workspaceInviteRoutes from './routes/workspace-invites';
import instagramRoutes from './routes/instagram';
import instagramOAuthRoutes from './routes/instagram-oauth';
import instagramSyncRoutes from './routes/instagram-sync';
import instagramDebugRoutes from './routes/instagram-debug';
import instagramWebhookRoutes from './routes/instagram-webhook';
import instagramLogsRoutes from './routes/instagram-logs';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import knowledgeRoutes from './routes/knowledge';
import settingsRoutes from './routes/settings';
import categoriesRoutes from './routes/categories';
import escalationRoutes from './routes/escalations';
import sandboxRoutes from './routes/sandbox';
import { scheduler } from './services/scheduler';
import dashboardRoutes from './routes/dashboard';
import supportTicketRoutes from './routes/supportTickets';
import { requestIdMiddleware } from './middleware/requestId';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

// Connect to database
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/workspace-invites', workspaceInviteRoutes);
app.use('/api/instagram', instagramOAuthRoutes); // OAuth routes (auth, callback)
app.use('/api/instagram', instagramSyncRoutes);   // Sync routes (sync-messages, send-message)
app.use('/api/instagram', instagramDebugRoutes);  // Debug routes
app.use('/api/instagram', instagramWebhookRoutes); // Webhook routes (real-time events)
app.use('/api/instagram', instagramLogsRoutes);    // Logs routes (view/manage logs)
app.use('/api/instagram', instagramRoutes);       // Legacy mock routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/sandbox', sandboxRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/support-tickets', supportTicketRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files from React frontend in production
if (isProduction) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));

  // Handle React routing - return index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (isProduction) {
    console.log('Serving frontend from ../frontend/dist');
  }

  // Start background job scheduler
  scheduler.start();
});
