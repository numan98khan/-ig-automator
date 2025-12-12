# AI Instagram Inbox - Prototype v1

An internal prototype of an AI-powered Instagram inbox management system where users can manage conversations, send messages, and leverage AI to generate intelligent replies based on a knowledge base.

## Features

- **Authentication**: User signup/login with JWT
- **Workspace Management**: Create and manage business workspaces
- **Mock Instagram Connection**: Connect Instagram accounts (demo mode, no real API)
- **Inbox**: View and manage Instagram conversations
- **AI-Powered Replies**: Generate intelligent responses using OpenAI
- **Knowledge Base**: Create FAQs and business information for AI context
- **Real-time Messaging**: Send and receive messages in conversations

## Tech Stack

### Backend
- Node.js + Express + TypeScript
- MongoDB with Mongoose
- JWT authentication
- OpenAI API for AI replies

### Frontend
- React 18 + TypeScript
- Vite
- React Router v6
- TailwindCSS
- Lucide React (icons)
- Axios

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- OpenAI API key

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend-new
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/instagram-inbox
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
OPENAI_API_KEY=your-openai-api-key-here
NODE_ENV=development
```

5. Start the development server:
```bash
npm run dev
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Update the `.env` file:
```env
VITE_API_URL=http://localhost:5000
```

5. Start the development server:
```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## Usage

1. **Sign Up**: Create a new account at `/signup`
2. **Create Workspace**: After signup, create your first workspace
3. **Connect Instagram**: Connect a mock Instagram account (demo mode)
4. **View Inbox**: Browse demo conversations that are automatically seeded
5. **Send Messages**: Type and send messages in conversations
6. **Generate AI Replies**: Click "Generate AI Reply" to get AI-powered responses
7. **Manage Knowledge**: Add FAQs and business info in the Knowledge tab
8. **Test AI**: Ask questions that match your knowledge base to see AI responses

## Project Structure

### Backend (`backend-new/`)
```
src/
├── config/          # Database configuration
├── controllers/     # Request handlers
├── middleware/      # Auth middleware
├── models/          # Mongoose models
├── routes/          # API routes
├── utils/           # Utilities (JWT, seed data)
└── index.ts         # Main server file
```

### Frontend (`frontend/`)
```
src/
├── components/      # Reusable components
├── context/         # React context (Auth)
├── pages/           # Page components
├── services/        # API client
└── App.tsx          # Main app component
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Create new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Workspaces
- `POST /api/workspaces` - Create workspace
- `GET /api/workspaces` - Get all workspaces

### Instagram
- `POST /api/instagram/connect` - Connect Instagram account (mock)
- `GET /api/instagram/workspace/:workspaceId` - Get Instagram accounts

### Conversations
- `GET /api/conversations/workspace/:workspaceId` - Get conversations
- `GET /api/conversations/:id` - Get conversation by ID

### Messages
- `GET /api/messages/conversation/:conversationId` - Get messages
- `POST /api/messages` - Send message
- `POST /api/messages/generate-ai-reply` - Generate AI reply

### Knowledge
- `GET /api/knowledge/workspace/:workspaceId` - Get knowledge items
- `POST /api/knowledge` - Create knowledge item
- `PUT /api/knowledge/:id` - Update knowledge item
- `DELETE /api/knowledge/:id` - Delete knowledge item

## Environment Variables

### Backend
- `PORT` - Server port (default: 5000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT tokens
- `OPENAI_API_KEY` - OpenAI API key
- `NODE_ENV` - Environment (development/production)

### Frontend
- `VITE_API_URL` - Backend API URL

## Next Steps (Future Versions)

- Real Instagram Graph API integration
- Instagram webhooks for real-time messages
- Comment to DM automation
- Multiple workspace support
- Team collaboration features
- Advanced AI customization
- Analytics and reporting

## License

Private - Internal Use Only
