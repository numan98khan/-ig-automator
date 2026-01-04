import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { connectDB } from './config/database';
import { ensureCoreSchema } from './db/coreSchema';

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
import escalationRoutes from './routes/escalations';
import { scheduler } from './services/scheduler';
import dashboardRoutes from './routes/dashboard';
import supportTicketRoutes from './routes/supportTickets';
import { requestIdMiddleware } from './middleware/requestId';
import assistantRoutes from './routes/assistant';
import adminRoutes from './routes/admin';
import tierRoutes from './routes/tiers';
import automationRoutes from './routes/automations';
import flowTemplateRoutes from './routes/flow-templates';
import automationInstanceRoutes from './routes/automation-instances';
import integrationsRoutes from './routes/integrations';
import crmRoutes from './routes/crm';
import uiSettingsRoutes from './routes/ui-settings';
import { ensureDefaultAdmin } from './utils/defaultAdmin';
import { initConsoleLogCapture } from './services/consoleLogCapture';

// Load environment variables
dotenv.config();

const app = express();
initConsoleLogCapture();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

const startServer = async () => {
  try {
    await ensureCoreSchema();
  } catch (error) {
    console.error('Failed to ensure core Postgres schema:', error);
    process.exit(1);
  }

  connectDB();
  ensureDefaultAdmin();
};

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/workspace-invites', workspaceInviteRoutes);
app.use('/api/instagram', instagramOAuthRoutes); // OAuth routes (auth, callback)
app.use('/api/instagram', instagramSyncRoutes);   // Sync routes (sync-messages, send-message)
app.use('/api/instagram', instagramDebugRoutes);  // Debug routes
app.use('/api/instagram', instagramWebhookRoutes); // Webhook routes (real-time events)
app.use('/api/instagram', instagramLogsRoutes);    // Logs routes (view/manage logs)
app.use('/api/instagram', instagramRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/support-tickets', supportTicketRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tiers', tierRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/flow-templates', flowTemplateRoutes);
app.use('/api/automation-instances', automationInstanceRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/ui-settings', uiSettingsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static files from React frontend in production
if (isProduction) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  const sitemapPath = path.join(frontendPath, 'sitemap.xml');
  const robotsPath = path.join(frontendPath, 'robots.txt');

  app.get('/sitemap.xml', (req, res) => {
    if (fs.existsSync(sitemapPath)) {
      res.type('application/xml');
      res.sendFile(sitemapPath);
      return;
    }
    res.status(404).send('Sitemap not found');
  });

  app.get('/site-map.xml', (req, res) => {
    if (fs.existsSync(sitemapPath)) {
      res.type('application/xml');
      res.sendFile(sitemapPath);
      return;
    }
    res.status(404).send('Sitemap not found');
  });

  app.get('/robots.txt', (req, res) => {
    if (fs.existsSync(robotsPath)) {
      res.type('text/plain');
      res.sendFile(robotsPath);
      return;
    }
    res.status(404).send('Robots file not found');
  });

  app.use(express.static(frontendPath));

  // Handle React routing - return index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

startServer()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (isProduction) {
        console.log('Serving frontend from ../frontend/dist');
      }

      // Start background job scheduler
      scheduler.start();
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
