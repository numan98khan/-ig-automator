# Document RAG AI Template

A production-ready template for building AI-powered document retrieval applications using RAG (Retrieval Augmented Generation). This template provides a complete full-stack application with a FastAPI backend, React frontend, and Railway deployment configuration.

## Features

- **Document Management**: Upload and process PDFs, DOCX, TXT, HTML, Markdown, and more
- **Vector Search**: Dual database support (PostgreSQL/pgvector for production, ChromaDB for development)
- **Conversation History**: Persistent multi-conversation support with auto-generated titles
- **Benchmark System**: Test and compare AI models with custom test suites
- **Google Drive Integration**: Optional sync with Google Drive folders
- **Advanced RAG Pipeline**: Configurable retrieval, reranking, and response generation
- **Policy Management**: Customizable topic filters, banned phrases, and response styles
- **Observability**: Built-in debug mode with detailed pipeline inspection
- **PWA Support**: Installable progressive web app with offline capabilities
- **Railway Ready**: Pre-configured for one-click Railway deployment

## Tech Stack

### Backend
- **FastAPI**: High-performance Python web framework
- **LangChain**: RAG orchestration and document processing
- **OpenAI**: GPT models for embeddings and chat completion
- **PostgreSQL + pgvector**: Production vector database (Railway)
- **ChromaDB**: Local development vector database
- **Unstructured**: Advanced document parsing with OCR support

### Frontend
- **React 18**: Modern UI library
- **TypeScript**: Type-safe development
- **Vite**: Fast build tooling
- **TailwindCSS**: Utility-first styling
- **React Query**: Server state management
- **React Router**: Client-side routing
- **Lucide React**: Icon library

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+
- OpenAI API key

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

2. **Set up environment variables**
   ```bash
   # Backend
   export OPENAI_API_KEY="sk-..."
   export DATA_DIR="./data"
   export CHROMA_DIR="./demo_chroma"

   # Optional: Google Drive integration
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"
   export GDRIVE_FOLDER_NAME="documents"
   ```

3. **Install backend dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

5. **Start the backend** (from project root)
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```

6. **Start the frontend** (in a new terminal)
   ```bash
   cd frontend
   npm run dev
   ```

7. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### First-Time Setup

1. **Add documents** to the `data/` directory (create it if it doesn't exist)
2. **Build the vector index**: `POST http://localhost:8000/api/index/build`
3. **Start chatting** with your documents!

## Railway Deployment

This template is pre-configured for Railway deployment with a single Dockerfile that builds both backend and frontend.

### Environment Variables (Railway)

Set these in your Railway project:

```bash
# Required
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=https://your-frontend.railway.app

# Optional
GDRIVE_FOLDER_NAME=documents
GOOGLE_SERVICE_ACCOUNT_JSON={"type": "service_account", ...}
```

Railway automatically provides:
- `DATABASE_URL` (PostgreSQL with pgvector)
- `PORT` (Application port)

### Deployment Steps

1. Create a new Railway project
2. Connect your GitHub repository
3. Railway will automatically detect the Dockerfile
4. Set the required environment variables
5. Deploy!

## Customizing This Template

This template is designed to be easily customized for your specific AI application needs:

### 1. Branding & UI

- **App Name**: Update in `frontend/index.html`, `frontend/public/manifest.json`, and `frontend/src/App.tsx`
- **Icon**: Replace `frontend/public/icon.svg` with your custom icon
- **Colors**: Modify the theme in `frontend/tailwind.config.js`
- **Welcome Message**: Update in `frontend/src/components/ChatInterface.tsx`

### 2. Domain-Specific Configuration

- **Policies**: Customize allowed/blocked topics in the Settings page
- **System Prompts**: Modify the RAG agent behavior (see backend configuration)
- **Sample Questions**: Update example queries in ChatInterface component

### 3. Data Sources

- **Document Types**: Already supports PDF, DOCX, TXT, HTML, MD, PPTX
- **Google Drive**: Enable by setting `GOOGLE_APPLICATION_CREDENTIALS`
- **Custom Loaders**: Extend `document_loader.py` for new source types

### 4. Advanced Customization

- **RAG Pipeline**: Modify retrieval, reranking, and generation logic
- **Embeddings**: Switch embedding models in the RAG agent configuration
- **LLM Models**: Configure different OpenAI models in the UI dropdown
- **Database Schema**: Extend `db_models.py` for custom metadata

## Project Structure

```
.
├── backend/
│   ├── main.py              # FastAPI application
│   ├── query_agent.py       # RAG agent implementation
│   ├── document_parser.py   # Document processing
│   ├── document_loader.py   # Document loading utilities
│   ├── gdrive_sync.py       # Google Drive integration
│   ├── db_models.py         # Database models
│   ├── db_config.py         # Database configuration
│   └── policies.yaml        # Default policy configuration
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API client
│   │   └── hooks/           # Custom React hooks
│   ├── public/              # Static assets
│   └── index.html           # Entry HTML
├── data/                    # Document storage (local)
├── demo_chroma/             # ChromaDB storage (local)
├── Dockerfile               # Railway deployment
├── railway.toml             # Railway configuration
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

## API Endpoints

### Document Management
- `POST /api/upload` - Upload documents
- `POST /api/index/build` - Build vector index
- `GET /api/index/status` - Check index status
- `GET /api/documents` - List documents

### Chat
- `POST /api/query` - Ask questions
- `GET /api/conversations` - List conversations
- `GET /api/conversations/{id}` - Get conversation history

### Settings
- `GET /api/settings` - Get current settings
- `POST /api/settings` - Update settings
- `POST /api/settings/reset` - Reset to defaults

### Google Drive
- `POST /api/gdrive/sync` - Sync from Google Drive
- `GET /api/gdrive/files` - List synced files

### Benchmarks
- `POST /api/benchmark/run` - Run benchmark tests
- `GET /api/benchmark/history` - Get benchmark history

## Configuration

### Backend Settings (policies.yaml)

```yaml
disclosures:
  disclaimer: "AI-generated content may contain errors..."

blocked_topics:
  - "offensive content"

allowed_topics:
  - "general questions"
  - "document analysis"

answer_style:
  max_quotes: 3
  max_reasoning_bullets: 3
  cite_mode: "inline"

fallback:
  off_topic_message: "I can only answer questions about the uploaded documents."
  off_domain_message: "This question is outside my knowledge domain."

retrieval:
  k: 8
  fetch_k: 20
  mmr_lambda: 0.7
  min_similarity: 0.0
  min_distance: 1.5
  lexical_weight: 0.2
```

## Troubleshooting

### Vector Index Issues
If you see "Vector database not initialized":
1. Ensure documents are in the `data/` directory
2. Call `POST /api/index/build` to create the index
3. Check backend logs for errors

### CORS Errors
Add your frontend URL to `ALLOWED_ORIGINS`:
```bash
export ALLOWED_ORIGINS="http://localhost:5173,https://your-domain.com"
```

### ChromaDB Corruption
The app automatically detects and backs up corrupted ChromaDB instances. Check logs for backup locations.

## Development Tips

- **Debug Mode**: Click 7 times on the version badge to enable debug mode
- **Hot Reload**: Both frontend (Vite) and backend (uvicorn --reload) support hot reload
- **API Testing**: Use the interactive docs at `http://localhost:8000/docs`
- **Database Migrations**: Handled automatically on startup

## Contributing

This template is designed to be a starting point for your AI applications. Feel free to:
- Fork and customize for your needs
- Submit issues for bugs or feature requests
- Share your customizations with the community

## License

[Add your license here]

## Support

For questions or issues:
- Check the troubleshooting section above
- Review API docs at `/docs`
- Open an issue on GitHub

## Acknowledgments

Built with:
- [LangChain](https://langchain.com/)
- [OpenAI](https://openai.com/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Railway](https://railway.app/)
