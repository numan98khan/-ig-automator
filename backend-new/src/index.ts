import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { connectDB } from './config/database';

// Import routes
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import instagramRoutes from './routes/instagram';
import instagramOAuthRoutes from './routes/instagram-oauth';
import instagramSyncRoutes from './routes/instagram-sync';
import conversationRoutes from './routes/conversations';
import messageRoutes from './routes/messages';
import knowledgeRoutes from './routes/knowledge';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/instagram', instagramOAuthRoutes); // OAuth routes (auth, callback)
app.use('/api/instagram', instagramSyncRoutes);   // Sync routes (sync-messages, send-message)
app.use('/api/instagram', instagramRoutes);       // Legacy mock routes
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/knowledge', knowledgeRoutes);

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
});
