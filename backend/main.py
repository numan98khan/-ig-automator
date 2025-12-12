"""
FastAPI backend for Document RAG AI Assistant
"""

# ============================================================================
# HTTPX COMPATIBILITY SHIM - MUST BE FIRST!
# ============================================================================
# This shim fixes langchain-openai 0.2.9 compatibility with httpx 0.27+
# langchain-openai uses old httpx API: proxies={"http://": ..., "https://": ...}
# httpx 0.27+ uses new API: proxy="http://..."
# This monkey-patch makes httpx.Client AND httpx.AsyncClient accept both APIs

import httpx as _httpx_module

import json

# Patch sync Client
_original_httpx_client_init = _httpx_module.Client.__init__

def _patched_httpx_client_init(self, *args, **kwargs):
    """Compatibility shim: convert old 'proxies' dict to new 'proxy' string"""
    if 'proxies' in kwargs:
        proxies_dict = kwargs.pop('proxies')
        # Convert old dict format to new string format
        # Use https proxy if available, otherwise http
        if isinstance(proxies_dict, dict):
            proxy_url = proxies_dict.get('https://') or proxies_dict.get('http://')
            if proxy_url:
                kwargs['proxy'] = proxy_url
    return _original_httpx_client_init(self, *args, **kwargs)

_httpx_module.Client.__init__ = _patched_httpx_client_init

# Patch async AsyncClient
_original_httpx_asyncclient_init = _httpx_module.AsyncClient.__init__

def _patched_httpx_asyncclient_init(self, *args, **kwargs):
    """Compatibility shim: convert old 'proxies' dict to new 'proxy' string"""
    if 'proxies' in kwargs:
        proxies_dict = kwargs.pop('proxies')
        # Convert old dict format to new string format
        # Use https proxy if available, otherwise http
        if isinstance(proxies_dict, dict):
            proxy_url = proxies_dict.get('https://') or proxies_dict.get('http://')
            if proxy_url:
                kwargs['proxy'] = proxy_url
    return _original_httpx_asyncclient_init(self, *args, **kwargs)

_httpx_module.AsyncClient.__init__ = _patched_httpx_asyncclient_init

# ============================================================================
# END HTTPX COMPATIBILITY SHIM
# ============================================================================

# ============================================================================
# SANITIZE ENVIRONMENT VARIABLES
# ============================================================================
# Strip whitespace from critical environment variables to prevent header errors
# Railway sometimes adds trailing newlines when env vars are set

import os

if 'OPENAI_API_KEY' in os.environ:
    os.environ['OPENAI_API_KEY'] = os.environ['OPENAI_API_KEY'].strip()

# ============================================================================
# END ENVIRONMENT SANITIZATION
# ============================================================================

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sys
import logging
from pathlib import Path
from datetime import datetime

import shutil
import time

def _ts():
    return time.strftime("%Y%m%d-%H%M%S")

def is_chroma_corrupt(chroma_dir: Path) -> bool:
    """
    Detects the '_type' KeyError corruption when opening the collection.
    Returns True if corrupt, False otherwise.
    """
    try:
        # --- NumPy 2.0 legacy alias shim (for chromadb) ---
        import numpy as np  # must run BEFORE importing chromadb

        _aliases = {
            "float_": "float64",
            "int_": "int64",
            "uint": "uint64",
        }
        for old_name, new_name in _aliases.items():
            if not hasattr(np, old_name) and hasattr(np, new_name):
                setattr(np, old_name, getattr(np, new_name))
        # ---------------------------------------------------

        import chromadb
        from chromadb.config import Settings
        client = chromadb.PersistentClient(
            path=str(chroma_dir),
            settings=Settings(anonymized_telemetry=False)
        )
        # default collection name created by langchain_community Chroma is "langchain"
        coll = client.get_or_create_collection("langchain")
        _ = coll.count()  # will throw on corrupt config
        return False
    except KeyError as e:
        # The signature error of this corruption is KeyError: '_type'
        if str(e) == "'_type'":
            return True
        return False
    except Exception:
        # Other errors shouldn't be treated as the specific corruption
        return False

def archive_chroma(chroma_dir: Path) -> Path:
    """
    Moves the current chroma dir to a timestamped backup folder and returns the backup path.
    """
    backup = chroma_dir.parent / f"{chroma_dir.name}.bak-{_ts()}"
    shutil.move(str(chroma_dir), str(backup))
    return backup


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

logger.info("🚀 Importing application modules...")
from query_agent import RAGAgent
from document_loader import load_all_documents
from gdrive_sync import GoogleDriveSync, GDRIVE_AVAILABLE
from db_models import (
    init_database, get_db,
    create_conversation, get_conversation, get_all_conversations,
    update_conversation_title, delete_conversation,
    add_message, get_conversation_messages, auto_generate_title,
    upsert_gdrive_file, mark_file_indexed, get_gdrive_file,
    get_all_gdrive_files, get_indexed_file_ids,
    create_benchmark_suite, get_benchmark_suites, get_benchmark_suite,
    create_benchmark_run, get_benchmark_run, get_benchmark_history,
    get_settings, upsert_settings, get_latest_settings_record
)
logger.info("✅ Application modules imported successfully")

# Define base directory (project root)
BASE_DIR = Path(__file__).parent.parent
logger.info(f"📂 Base directory: {BASE_DIR}")

# Use environment variables with sensible defaults
# Support both CHROMA_DIR and CHROMA_PERSIST_DIR (Railway uses CHROMA_PERSIST_DIR)
DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
CHROMA_DIR = Path(os.getenv("CHROMA_DIR") or os.getenv("CHROMA_PERSIST_DIR") or str(BASE_DIR / "demo_chroma"))
logger.info(f"📂 Data directory: {DATA_DIR}")
logger.info(f"📂 Chroma directory: {CHROMA_DIR}")

# Check if paths exist and log their status
if not DATA_DIR.exists():
    logger.warning(f"⚠️  Data directory does not exist: {DATA_DIR}")
else:
    doc_count = len(list(DATA_DIR.glob("**/*.*")))
    logger.info(f"📄 Found {doc_count} files in data directory")

if not CHROMA_DIR.exists():
    logger.warning(f"⚠️  Chroma directory does not exist: {CHROMA_DIR} (will be created on first index build)")
else:
    logger.info(f"✅ Chroma directory exists: {CHROMA_DIR}")

# Google credentials from environment variable (set via Railway)
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
GOOGLE_CREDENTIALS = Path(GOOGLE_CREDENTIALS_PATH) if GOOGLE_CREDENTIALS_PATH else None
if GOOGLE_CREDENTIALS:
    logger.info(f"🔐 Google credentials configured at: {GOOGLE_CREDENTIALS}")
else:
    logger.warning("⚠️  No Google credentials configured")

# Initialize FastAPI app
logger.info("🌐 Initializing FastAPI application...")
app = FastAPI(
    title="Document RAG API",
    description="AI-powered document search and retrieval",
    version="1.0.0"
)

# Configure CORS - use environment variable for allowed origins
allowed_origins_str = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"  # Default for local development
)

# Handle wildcard case
if allowed_origins_str == "*":
    ALLOWED_ORIGINS = ["*"]
else:
    ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_str.split(",")]

logger.info(f"🔐 CORS allowed origins: {ALLOWED_ORIGINS}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global RAG agent instance
rag_agent: Optional[RAGAgent] = None
logger.info("✅ FastAPI application initialized")


@app.on_event("startup")
async def startup_event():
    """Create necessary directories on startup and check index status"""
    logger.info("🚀 Application startup event triggered")
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        logger.info(f"✅ Data directory created/verified: {DATA_DIR}")

        # Initialize conversation database
        try:
            db_success = init_database()
            if db_success:
                logger.info("✅ Conversation database initialized")
            else:
                logger.warning("⚠️  Conversation database initialization failed - app will run without persistence")
        except Exception as e:
            logger.error(f"⚠️  Failed to initialize conversation database: {e}")
            logger.warning("   Application will continue without conversation persistence")

        # Check for documents
        doc_files = list(DATA_DIR.glob("**/*.pdf")) + list(DATA_DIR.glob("**/*.docx")) + list(DATA_DIR.glob("**/*.txt"))
        logger.info(f"📄 Found {len(doc_files)} documents in {DATA_DIR}")
        if len(doc_files) == 0:
            logger.warning("⚠️  No documents found! Add documents to /app/data or sync from Google Drive")

        # Check for ChromaDB index
        logger.info(f"📊 Chroma directory: {CHROMA_DIR} (exists: {CHROMA_DIR.exists()})")
        if CHROMA_DIR.exists():
            chroma_files = list(CHROMA_DIR.glob("**/*"))
            logger.info(f"✅ ChromaDB index exists with {len(chroma_files)} files")
        else:
            logger.warning(f"⚠️  ChromaDB index not found at {CHROMA_DIR}")
            if len(doc_files) > 0:
                logger.info("💡 Documents found but no index. Call POST /api/index/build to create index")
            else:
                logger.warning("⚠️  No documents and no index. Add documents first, then build index")

        logger.info(f"📁 Base directory: {BASE_DIR}")

        # Log environment status
        logger.info(f"🔑 OpenAI API key configured: {bool(os.getenv('OPENAI_API_KEY'))}")
        logger.info(f"☁️  Google Drive available: {GDRIVE_AVAILABLE}")
        logger.info("✅ Startup completed successfully")
    except Exception as e:
        logger.error(f"❌ Startup error: {str(e)}", exc_info=True)


# ======================= Pydantic models =======================

class QueryRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None  # Add conversation ID support
    debug: Optional[bool] = False  # return structured JSON as well if True
    model: Optional[str] = "gpt-5-mini"  # AI model to use

class SourceItem(BaseModel):
    filename: str
    page: Optional[str] = None
    snippet: Optional[str] = None

class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceItem]
    debug_json: Optional[Dict[str, Any]] = None

class SyncRequest(BaseModel):
    folder_name: str

class SyncResponse(BaseModel):
    success: bool
    message: str
    stats: Optional[Dict[str, int]] = None

class HealthResponse(BaseModel):
    status: str
    database_initialized: bool
    gdrive_available: bool
    openai_configured: bool

class DocumentInfo(BaseModel):
    filename: str
    type: str
    size: Optional[int] = None

class BenchmarkTest(BaseModel):
    id: str
    question: str
    must_include: List[str] = []
    must_exclude: List[str] = []
    must_cite: List[str] = []
    policy_expect: Dict[str, Any] = {}

class BenchmarkRunRequest(BaseModel):
    suite_name: str = "default"
    tests: Optional[List[BenchmarkTest]] = None  # Can provide tests directly or use stored suite
    model: str = "gpt-4o-mini"  # OpenAI model to use for testing

class BenchmarkRunResponse(BaseModel):
    run_id: str
    status: str
    summary: Optional[Dict[str, Any]] = None
    results: Optional[List[Dict[str, Any]]] = None

# Conversation models
class ConversationCreate(BaseModel):
    title: Optional[str] = "New Conversation"

class ConversationResponse(BaseModel):
    id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    message_count: int

class MessageResponse(BaseModel):
    id: int
    conversation_id: str
    role: str
    content: str
    sources: Optional[str] = None
    observability: Optional[str] = None
    created_at: str

class ConversationDetailResponse(BaseModel):
    id: str
    title: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    messages: List[MessageResponse]

# Settings models
class SettingsResponse(BaseModel):
    id: int
    settings: Dict[str, Any]
    created_at: str
    updated_at: str

class SettingsUpdateRequest(BaseModel):
    settings: Dict[str, Any]


# ======================= Helpers =======================

def get_rag_agent() -> RAGAgent:
    """Get or initialize RAG agent"""
    global rag_agent

    if rag_agent is None:
        logger.info("🤖 Initializing RAG agent...")

        # Check if ChromaDB exists
        if not CHROMA_DIR.exists():
            logger.error(f"❌ Vector database not found at {CHROMA_DIR}")
            logger.error(f"   Please build the index first: POST /api/index/build")
            raise HTTPException(
                status_code=503,
                detail=f"Vector database not initialized at {CHROMA_DIR}. Please build the index first via POST /api/index/build"
            )

        # Check if ChromaDB has content
        chroma_files = list(CHROMA_DIR.glob("**/*"))
        logger.info(f"📊 ChromaDB directory has {len(chroma_files)} files")

        if len(chroma_files) == 0:
            logger.error(f"❌ ChromaDB directory exists but is empty: {CHROMA_DIR}")
            raise HTTPException(
                status_code=503,
                detail=f"Vector database is empty. Please build the index first via POST /api/index/build"
            )

        try:
            # Ensure project root for relative paths
            os.chdir(BASE_DIR)
            logger.info(f"📂 Changed working directory to: {BASE_DIR}")
            logger.info(f"🔧 Initializing RAGAgent with ChromaDB at: {CHROMA_DIR}")

            # Try to load settings from database first
            policies_dict = None
            try:
                db = next(get_db())
                policies_dict = get_settings(db)
                if policies_dict:
                    logger.info("✅ Loaded settings from database")
                else:
                    logger.info("📋 No database settings found, using policies.yaml")
            except Exception as e:
                logger.warning(f"⚠️  Failed to load settings from database: {e}")
                logger.info("📋 Falling back to policies.yaml")

            start_time = datetime.now()
            # Pass policies_dict if available (from database) or None (will use YAML)
            rag_agent = RAGAgent(policies_dict=policies_dict)
            elapsed = (datetime.now() - start_time).total_seconds()

            logger.info(f"✅ RAG agent initialized successfully in {elapsed:.2f}s")

            # Test retrieval capability
            if hasattr(rag_agent, 'retriever') and rag_agent.retriever:
                logger.info("✅ RAG agent retriever is ready")
            else:
                logger.warning("⚠️  RAG agent initialized but retriever is None")

        except Exception as e:
            logger.error(f"❌ Failed to initialize RAG agent: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to initialize RAG agent: {str(e)}"
            )
    else:
        logger.debug("♻️  Reusing existing RAG agent instance")

    return rag_agent


def _sources_from_quotes(quotes: List[Dict[str, Any]], max_items: int = 6) -> List[Dict[str, Any]]:
    """
    Convert agent's quotes -> API 'sources' (filename, page, snippet, bounding_box, file_id).
    Dedups by (filename, page).
    Enriches with bounding box data from the database for visual highlighting.
    """
    from db_config import get_database_url
    from sqlalchemy import text, create_engine

    out = []
    seen = set()

    # Get database connection for enriching sources with bounding box data
    try:
        database_url = get_database_url()
        engine = create_engine(database_url)
    except Exception as e:
        logger.warning(f"⚠️ Failed to connect to database for source enrichment: {e}")
        engine = None

    for q in quotes[:max_items]:
        src = (q.get("source") or "").strip()
        if not src:
            continue
        filename = os.path.basename(src)
        page = q.get("page")

        key = (filename, str(page) if page is not None else "")
        if key in seen:
            continue
        seen.add(key)
        snippet = (q.get("quote") or "")[:300]

        source_dict = {
            "filename": filename,
            "page": str(page) if page is not None else "",
            "snippet": snippet,
            "bounding_box": None,
            "file_id": None
        }

        # Enrich with bounding box and file_id from database
        if engine and page is not None:
            try:
                with engine.connect() as conn:
                    # Query for chunks matching source and page
                    query = text("""
                        SELECT cmetadata
                        FROM langchain_pg_embedding
                        WHERE collection_id = (SELECT uuid FROM langchain_pg_collection WHERE name = 'documents')
                        AND cmetadata->>'source' LIKE :source
                        AND cmetadata->>'page' = :page
                        LIMIT 1
                    """)
                    result = conn.execute(query, {"source": f"%{filename}", "page": str(page)}).fetchone()

                    if result and result[0]:
                        metadata = result[0]

                        # Extract bounding_box from metadata
                        if "bounding_box" in metadata:
                            try:
                                source_dict["bounding_box"] = json.loads(metadata["bounding_box"])
                                logger.debug(f"✅ Enriched {filename} page {page} with bounding box")
                            except Exception as e:
                                logger.warning(f"⚠️ Failed to parse bounding_box JSON for {filename} page {page}: {e}")

                        # Extract file_id from metadata
                        if "file_id" in metadata:
                            source_dict["file_id"] = metadata["file_id"]
            except Exception as e:
                logger.warning(f"⚠️ Failed to enrich source {filename} page {page}: {e}")

        out.append(source_dict)

    return out


# ======================= API Endpoints =======================

@app.get("/", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    logger.debug("🏥 Health check requested")

    db_init = CHROMA_DIR.exists()
    gdrive_avail = bool(GDRIVE_AVAILABLE and GOOGLE_CREDENTIALS and GOOGLE_CREDENTIALS.exists())
    openai_conf = bool(os.getenv("OPENAI_API_KEY"))

    logger.debug(f"   Database initialized: {db_init}")
    logger.debug(f"   Google Drive available: {gdrive_avail}")
    logger.debug(f"   OpenAI configured: {openai_conf}")

    return {
        "status": "healthy",
        "database_initialized": db_init,
        "gdrive_available": gdrive_avail,
        "openai_configured": openai_conf
    }


@app.post("/api/query")
async def query_documents(request: QueryRequest):
    """
    Query the RAG system with a question.
    Returns full debug information if debug=true, otherwise compact response.
    """
    start_time = datetime.now()
    q = (request.question or "").strip()

    logger.info(f"❓ Query received: '{q[:100]}...' (debug={request.debug}, model={request.model})")

    if not q:
        logger.warning("⚠️  Empty question received")
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        logger.info(f"🤖 Initializing RAG agent with model: {request.model}")
        # Create agent instance with selected model (similar to benchmark approach)
        from query_agent import RAGAgent

        # Load settings from database first
        policies_dict = None
        try:
            db = next(get_db())
            policies_dict = get_settings(db)
            if policies_dict:
                logger.info("=" * 80)
                logger.info("✅ SETTINGS LOADED FROM DATABASE")
                logger.info("=" * 80)
                logger.info(f"📋 Blocked topics: {policies_dict.get('blocked_topics', [])}")
                logger.info(f"📋 Blocked regex: {policies_dict.get('blocked_regex', [])}")
                logger.info(f"📋 Allowed topics: {policies_dict.get('allowed_topics', [])}")
                logger.info(f"📋 Off-topic message: '{policies_dict.get('fallback', {}).get('off_topic_message', 'N/A')[:100]}...'")
                logger.info(f"📋 Off-domain message: '{policies_dict.get('fallback', {}).get('off_domain_message', 'N/A')[:100]}...'")
                logger.info(f"📋 Retrieval: k={policies_dict.get('retrieval', {}).get('k', 'N/A')}, fetch_k={policies_dict.get('retrieval', {}).get('fetch_k', 'N/A')}, mmr_lambda={policies_dict.get('retrieval', {}).get('mmr_lambda', 'N/A')}")
                logger.info(f"📋 Memory: max_turns={policies_dict.get('memory', {}).get('max_turns', 'N/A')}")
                logger.info("=" * 80)
            else:
                logger.info("=" * 80)
                logger.info("📋 NO DATABASE SETTINGS - USING POLICIES.YAML")
                logger.info("=" * 80)
        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"⚠️  FAILED TO LOAD SETTINGS FROM DATABASE: {e}")
            logger.error("📋 FALLING BACK TO POLICIES.YAML")
            logger.error("=" * 80)

        if request.model == "gpt-5-mini":
            # gpt-5-mini only supports temperature=1 (the default)
            logger.info(f"🤖 Creating LegalRAGAgent(model={request.model}, temperature=1, policies_dict={'PROVIDED' if policies_dict else 'NONE'})")
            agent = LegalRAGAgent(model_name=request.model, temperature=1, policies_dict=policies_dict)
        else:
            # Other models use temperature=0 for consistent responses
            logger.info(f"🤖 Creating LegalRAGAgent(model={request.model}, temperature=0, policies_dict={'PROVIDED' if policies_dict else 'NONE'})")
            agent = LegalRAGAgent(model_name=request.model, temperature=0, policies_dict=policies_dict)

        # Use conversation_id from request or default to "rest"
        conv_id = request.conversation_id or "rest"

        # Use debug path if the caller wants full observability data
        if request.debug:
            logger.info("🔍 Running query in DEBUG mode...")
            query_start = datetime.now()
            res = agent.query_debug(q, conversation_id=conv_id)
            query_elapsed = (datetime.now() - query_start).total_seconds()
            logger.info(f"✅ Debug query completed in {query_elapsed:.2f}s")

            answer = res["answer"]
            j = res["json"]
            debug_info = res.get("debug", {})
            sources = _sources_from_quotes(j.get("quotes", []))

            logger.info(f"📊 Answer length: {len(answer)} chars, Sources: {len(sources)}")
            logger.debug(f"   Policy flags: {j.get('policy_flags', [])}")
            logger.debug(f"   Quotes: {len(j.get('quotes', []))}")

            # Save to database if conversation_id is provided and not "rest"
            if request.conversation_id and request.conversation_id != "rest":
                try:
                    db = next(get_db())
                    # Save user message
                    add_message(db, request.conversation_id, "user", q)

                    # Prepare observability data for storage
                    observability_data = json.dumps({
                        "policy_checks": debug_info.get("policy", {}),
                        "memory_context": debug_info.get("memory", {}),
                        "retrieval_pipeline": debug_info.get("retrieval", {}),
                        "gates": debug_info.get("gates", {}),
                        "context_preview": debug_info.get("context_preview", ""),
                        "model_raw": debug_info.get("model_raw", ""),
                        "parsed_json": debug_info.get("parsed_json", {})
                    })

                    # Save assistant message with enriched sources and observability data
                    add_message(
                        db,
                        request.conversation_id,
                        "assistant",
                        answer,
                        sources=json.dumps(sources),  # Store enriched sources with bounding_box and file_id
                        observability=observability_data
                    )
                    logger.info(f"💾 Saved messages with debug data to conversation {request.conversation_id}")
                except Exception as e:
                    logger.error(f"⚠️  Failed to save messages: {e}")

            # Return comprehensive debug response
            total_elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"✅ Total request time: {total_elapsed:.2f}s")

            return {
                "answer": answer,
                "sources": sources,
                "json": j,
                "debug": debug_info,
                "observability": {
                    "policy_checks": debug_info.get("policy", {}),
                    "memory_context": debug_info.get("memory", {}),
                    "retrieval_pipeline": debug_info.get("retrieval", {}),
                    "gates": debug_info.get("gates", {}),
                    "context_preview": debug_info.get("context_preview", ""),
                    "model_raw": debug_info.get("model_raw", ""),
                    "parsed_json": debug_info.get("parsed_json", {})
                }
            }
        else:
            # Compact response for production use
            logger.info("⚡ Running query in PRODUCTION mode...")
            query_start = datetime.now()
            res = agent.query(q, conversation_id=conv_id, return_raw_json=True)
            query_elapsed = (datetime.now() - query_start).total_seconds()
            logger.info(f"✅ Production query completed in {query_elapsed:.2f}s")

            answer = res["answer"]
            j = res["json"]
            sources = _sources_from_quotes(j.get("quotes", []))

            logger.info(f"📊 Answer length: {len(answer)} chars, Sources: {len(sources)}")

            # Save to database if conversation_id is provided and not "rest"
            if request.conversation_id and request.conversation_id != "rest":
                try:
                    db = next(get_db())
                    # Save user message
                    add_message(db, request.conversation_id, "user", q)
                    # Save assistant message with enriched sources
                    add_message(db, request.conversation_id, "assistant", answer, sources=json.dumps(sources))  # Store enriched sources with bounding_box and file_id
                    logger.info(f"💾 Saved messages to conversation {request.conversation_id}")

                    # Auto-generate title from first message if conversation title is "New Conversation"
                    conversation = get_conversation(db, request.conversation_id)
                    if conversation and conversation.title == "New Conversation":
                        new_title = auto_generate_title(q)
                        update_conversation_title(db, request.conversation_id, new_title)
                        logger.info(f"📝 Auto-generated title: {new_title}")
                except Exception as e:
                    logger.error(f"⚠️  Failed to save messages: {e}")

            total_elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"✅ Total request time: {total_elapsed:.2f}s")

            return {
                "answer": answer,
                "sources": sources,
                "json": j
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Query failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents", response_model=List[DocumentInfo])
async def list_documents():
    """
    List all documents in the data directory
    """
    if not DATA_DIR.exists():
        return []

    documents = []
    for filename in os.listdir(DATA_DIR):
        if filename.startswith('.'):
            continue
        filepath = DATA_DIR / filename

        # Determine file type
        if filename.lower().endswith('.pdf'):
            file_type = 'PDF'
        elif filename.lower().endswith('.docx'):
            file_type = 'Word'
        elif filename.lower().endswith('.txt'):
            file_type = 'Text'
        else:
            file_type = 'Other'

        # Get file size
        try:
            size = os.path.getsize(filepath)
        except Exception:
            size = None

        documents.append({
            "filename": filename,
            "type": file_type,
            "size": size
        })

    return sorted(documents, key=lambda x: x['filename'].lower())


@app.post("/api/sync", response_model=SyncResponse)
async def sync_google_drive(request: SyncRequest):
    """
    Sync documents from Google Drive
    """
    if not GDRIVE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Google Drive integration not available"
        )

    if not GOOGLE_CREDENTIALS or not GOOGLE_CREDENTIALS.exists():
        raise HTTPException(
            status_code=503,
            detail="Google Drive credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS environment variable."
        )

    credentials_file = GOOGLE_CREDENTIALS

    try:
        os.chdir(BASE_DIR)
        sync = GoogleDriveSync()

        if not sync.authenticate():
            raise HTTPException(
                status_code=401,
                detail="Failed to authenticate with Google Drive"
            )

        stats = sync.sync_folder(request.folder_name, local_dir=str(DATA_DIR))

        # Force agent reload (new docs)
        global rag_agent
        rag_agent = None

        return {
            "success": True,
            "message": f"Synced {stats.get('downloaded', 0)} documents",
            "stats": stats
        }

    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gdrive/files")
async def list_gdrive_files():
    """
    List all files from Google Drive with their indexing status.
    """
    if not GDRIVE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Google Drive integration not available"
        )

    if not GOOGLE_CREDENTIALS or not GOOGLE_CREDENTIALS.exists():
        raise HTTPException(
            status_code=503,
            detail="Google Drive credentials not configured."
        )

    try:
        os.chdir(BASE_DIR)
        sync = GoogleDriveSync()

        if not sync.authenticate():
            raise HTTPException(
                status_code=401,
                detail="Failed to authenticate with Google Drive"
            )

        # Get folder ID from environment or use default
        folder_name = os.getenv("GDRIVE_FOLDER_NAME", "documents")
        folder_id = sync.get_folder_id(folder_name)

        if not folder_id:
            # Try to list from root if folder not found
            logger.warning(f"Folder '{folder_name}' not found, listing from accessible folders")
            files = sync.list_all_files_recursive()
        else:
            files = sync.list_all_files_recursive(folder_id)

        # Get indexed file IDs from database
        db = next(get_db())
        indexed_file_ids = get_indexed_file_ids(db)

        # Upsert files to database and enrich with indexing status
        enriched_files = []
        for file in files:
            file_id = file['id']
            mime_type = file['mimeType']

            # Parse modified_time if available
            modified_time = None
            if 'modifiedTime' in file:
                from dateutil import parser as date_parser
                try:
                    modified_time = date_parser.parse(file['modifiedTime'])
                except:
                    pass

            # Upsert file to database
            db_file = upsert_gdrive_file(
                db,
                file_id=file_id,
                name=file['name'],
                mime_type=mime_type,
                size=file.get('size'),
                modified_time=modified_time,
                web_view_link=file.get('webViewLink')
            )

            # Enrich with additional info
            enriched_file = {
                **file,
                'is_supported': sync.is_supported_file(mime_type),
                'is_indexed': db_file.is_indexed,
                'indexed_at': db_file.indexed_at.isoformat() if db_file.indexed_at else None,
                'index_chunk_count': db_file.index_chunk_count if db_file.index_chunk_count is not None else 0
            }
            enriched_files.append(enriched_file)

        return {
            "files": enriched_files,
            "total": len(enriched_files)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error listing Google Drive files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gdrive/file/{file_id}")
async def get_gdrive_file_details(file_id: str):
    """
    Get detailed information about a specific Google Drive file.
    """
    if not GDRIVE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Google Drive integration not available"
        )

    if not GOOGLE_CREDENTIALS or not GOOGLE_CREDENTIALS.exists():
        raise HTTPException(
            status_code=503,
            detail="Google Drive credentials not configured."
        )

    try:
        os.chdir(BASE_DIR)
        sync = GoogleDriveSync()

        if not sync.authenticate():
            raise HTTPException(
                status_code=401,
                detail="Failed to authenticate with Google Drive"
            )

        # Get file metadata from Google Drive
        file_metadata = sync.get_file_metadata(file_id)

        if not file_metadata:
            raise HTTPException(status_code=404, detail="File not found in Google Drive")

        # Get indexing status from database
        db = next(get_db())
        db_file = get_gdrive_file(db, file_id)

        return {
            "file": file_metadata,
            "is_supported": sync.is_supported_file(file_metadata['mimeType']),
            "is_indexed": db_file.is_indexed if db_file else False,
            "indexed_at": db_file.indexed_at.isoformat() if db_file and db_file.indexed_at else None,
            "index_chunk_count": db_file.index_chunk_count if db_file else 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting file details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/gdrive/index/{file_id}")
async def index_gdrive_file(file_id: str, background_tasks: BackgroundTasks):
    """
    Index a specific Google Drive file into the vector database.
    """
    if not GDRIVE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Google Drive integration not available"
        )

    if not GOOGLE_CREDENTIALS or not GOOGLE_CREDENTIALS.exists():
        raise HTTPException(
            status_code=503,
            detail="Google Drive credentials not configured."
        )

    # Check if file is already indexed
    db = next(get_db())
    try:
        db_file = get_gdrive_file(db, file_id)
        if db_file and db_file.is_indexed:
            raise HTTPException(
                status_code=400,
                detail=f"File is already indexed. Delete existing chunks first if you want to re-index."
            )
    finally:
        db.close()

    def index_file_task(file_id: str):
        """Background task to index a single file"""
        from langchain_openai import OpenAIEmbeddings
        from langchain_community.vectorstores import PGVector
        from langchain_core.documents import Document
        from db_config import get_database_url
        from sqlalchemy import text, create_engine
        import tempfile

        import sys
        sys.path.append(str(BASE_DIR / "backend"))
        from document_parser import parse_and_chunk_file, ChunkOptions

        try:
            logger.info(f"🔨 Starting indexing for file {file_id}...")
            os.chdir(BASE_DIR)

            # Authenticate with Google Drive
            sync = GoogleDriveSync()
            if not sync.authenticate():
                logger.error("Failed to authenticate with Google Drive")
                return

            # Get file metadata
            file_metadata = sync.get_file_metadata(file_id)
            if not file_metadata:
                logger.error(f"File {file_id} not found")
                return

            file_name = file_metadata['name']
            mime_type = file_metadata['mimeType']

            logger.info(f"📄 Indexing file: {file_name}")

            # Download file to temp directory
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = os.path.join(temp_dir, file_name)

                # Add extension if needed
                extension = sync.supported_mimetypes.get(mime_type, '')
                if extension and not file_name.endswith(extension):
                    temp_path += extension

                # Download file
                if not sync.download_file(file_id, file_name, mime_type, temp_path):
                    logger.error(f"Failed to download file {file_name}")
                    return

                # Configure parsing options
                chunk_opts = ChunkOptions(
                    max_tokens=800,
                    overlap_tokens=100,
                    respect_headings=True,
                    keep_tables_intact=True,
                    combine_short_elements=True,
                    strategy="hi_res",
                )

                # Parse and chunk the file
                logger.info(f"📝 Parsing {file_name}...")
                chunks, elements = parse_and_chunk_file(temp_path, chunk_opts)

                if not chunks:
                    logger.warning(f"No chunks generated for {file_name}")
                    return

                logger.info(f"✂️  Created {len(chunks)} chunks from {file_name}")

                # Delete any existing chunks for this file to prevent duplicates
                database_url = get_database_url()
                engine = create_engine(database_url)

                logger.info(f"🗑️  Deleting any existing chunks for {file_id}...")
                with engine.connect() as conn:
                    delete_query = text("""
                        DELETE FROM langchain_pg_embedding
                        WHERE collection_id = (
                            SELECT uuid FROM langchain_pg_collection
                            WHERE name = 'documents'
                        )
                        AND cmetadata->>'file_id' = :file_id
                    """)
                    result = conn.execute(delete_query, {"file_id": file_id})
                    conn.commit()
                    deleted_count = result.rowcount
                    if deleted_count > 0:
                        logger.info(f"🗑️  Deleted {deleted_count} existing chunks")

                # Convert to LangChain documents
                documents = []
                for chunk in chunks:
                    metadata = {
                        "source": chunk.source.get("filename", file_name),
                        "file_id": file_id,
                        "chunk_id": chunk.chunk_id,
                        "tokens": chunk.tokens,
                        "from_elements": len(chunk.from_elements),
                    }

                    # Add page number if available (convert list to first page number)
                    if chunk.page_numbers:
                        metadata["page"] = chunk.page_numbers[0]
                        # Store all page numbers as comma-separated string
                        metadata["pages"] = ",".join(str(p) for p in chunk.page_numbers)

                    # Add section heading if available
                    if chunk.meta.get("section_heading"):
                        metadata["section"] = chunk.meta["section_heading"]

                    # Add bounding box for visual highlighting
                    if chunk.bounding_box:
                        metadata["bounding_box"] = json.dumps(chunk.bounding_box)
                        logger.info(f"💾 Storing bounding box for chunk: {chunk.bounding_box}")
                    else:
                        logger.warning(f"⚠️ No bounding box to store for chunk {chunk.chunk_id[:8]}...")

                    doc = Document(
                        page_content=chunk.text,
                        metadata=metadata
                    )
                    documents.append(doc)

                # Create embeddings and store in vector database
                logger.info(f"🔢 Creating embeddings for {len(documents)} chunks...")
                embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

                # Add to existing collection (don't delete)
                vectordb = PGVector.from_documents(
                    documents=documents,
                    embedding=embeddings,
                    collection_name="documents",
                    connection_string=database_url,
                    pre_delete_collection=False,  # Keep existing data
                )

                # Mark file as indexed in database
                db = next(get_db())
                try:
                    mark_file_indexed(db, file_id, chunk_count=len(documents))
                    db.commit()  # Ensure commit happens immediately
                finally:
                    db.close()

                logger.info(f"✅ Successfully indexed {file_name} ({len(documents)} chunks)")

        except Exception as e:
            logger.error(f"❌ Error indexing file {file_id}: {e}", exc_info=True)

    # Start background task
    background_tasks.add_task(index_file_task, file_id)

    return {
        "message": f"Indexing started for file {file_id}",
        "status": "processing"
    }


@app.get("/api/gdrive/chunks/{file_id}")
async def get_file_chunks(file_id: str):
    """
    Get all chunks for a specific Google Drive file from the vector database.
    Returns chunk text, metadata, and token information for observability.
    """
    try:
        from langchain_community.vectorstores import PGVector
        from langchain_openai import OpenAIEmbeddings
        from db_config import get_database_url
        from sqlalchemy import text

        logger.info(f"📊 Fetching chunks for file {file_id}")

        # Get database connection
        database_url = get_database_url()
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

        # Connect to PGVector
        vectordb = PGVector(
            collection_name="documents",
            connection_string=database_url,
            embedding_function=embeddings,
        )

        # Query chunks directly from the database using SQL
        from sqlalchemy import create_engine
        engine = create_engine(database_url)

        with engine.connect() as conn:
            # First, check if the collection exists and has any data
            collection_check = text("""
                SELECT COUNT(*) as total_chunks
                FROM langchain_pg_embedding
                WHERE collection_id = (
                    SELECT uuid FROM langchain_pg_collection
                    WHERE name = 'documents'
                )
            """)
            total_result = conn.execute(collection_check)
            total_chunks = total_result.fetchone()[0]
            logger.info(f"📈 Total chunks in database: {total_chunks}")

            # Check if file is marked as indexed in gdrive_files table
            db = next(get_db())
            db_file = get_gdrive_file(db, file_id)
            if db_file:
                logger.info(f"📝 File status: is_indexed={db_file.is_indexed}, chunk_count={db_file.index_chunk_count}")
            else:
                logger.warning(f"⚠️ File {file_id} not found in gdrive_files table")

            # Query the langchain_pg_embedding table
            query = text("""
                SELECT
                    document as content,
                    cmetadata as metadata,
                    uuid
                FROM langchain_pg_embedding
                WHERE collection_id = (
                    SELECT uuid FROM langchain_pg_collection
                    WHERE name = 'documents'
                )
                AND cmetadata->>'file_id' = :file_id
                ORDER BY
                    CAST(cmetadata->>'page' AS INTEGER) NULLS LAST,
                    uuid
            """)

            result = conn.execute(query, {"file_id": file_id})
            rows = result.fetchall()

            # If no rows found, let's check what file_ids exist
            if not rows:
                logger.warning(f"⚠️ No chunks found for file_id: {file_id}")
                # Sample some file_ids to see what's in the database
                sample_query = text("""
                    SELECT DISTINCT cmetadata->>'file_id' as file_id
                    FROM langchain_pg_embedding
                    WHERE collection_id = (
                        SELECT uuid FROM langchain_pg_collection
                        WHERE name = 'documents'
                    )
                    LIMIT 10
                """)
                sample_result = conn.execute(sample_query)
                sample_file_ids = [row[0] for row in sample_result.fetchall()]
                logger.info(f"📋 Sample file_ids in database: {sample_file_ids}")

        if not rows:
            # If file is marked as indexed but has no chunks, fix the inconsistency
            if db_file and db_file.is_indexed:
                logger.warning(f"🔧 Fixing inconsistency: file {file_id} is marked as indexed but has no chunks")
                db_file.is_indexed = False
                db_file.indexed_at = None
                db_file.index_chunk_count = 0
                db.commit()
                logger.info(f"✅ Fixed file status for {file_id}")

            return {
                "file_id": file_id,
                "chunks": [],
                "total_chunks": 0,
                "total_tokens": 0
            }

        # Format chunks for response
        chunks = []
        total_tokens = 0

        for row in rows:
            content, metadata, chunk_db_id = row

            # Parse bounding box from JSON if present
            bounding_box = None
            if metadata.get("bounding_box"):
                try:
                    bounding_box = json.loads(metadata["bounding_box"])
                    logger.info(f"📖 Retrieved bounding box from DB: {bounding_box}")
                except Exception as e:
                    logger.error(f"❌ Failed to parse bounding box JSON: {e}")
            else:
                logger.warning(f"⚠️ No bounding_box in metadata. Keys: {list(metadata.keys())}")

            chunk_data = {
                "id": str(chunk_db_id),
                "text": content,
                "chunk_id": metadata.get("chunk_id", ""),
                "tokens": metadata.get("tokens", 0),
                "page": metadata.get("page"),
                "pages": metadata.get("pages", "").split(",") if metadata.get("pages") else [],
                "section": metadata.get("section"),
                "from_elements": metadata.get("from_elements", 0),
                "source": metadata.get("source", ""),
                "bounding_box": bounding_box
            }

            chunks.append(chunk_data)
            total_tokens += chunk_data["tokens"]

        logger.info(f"✅ Found {len(chunks)} chunks for file {file_id} ({total_tokens} tokens)")

        return {
            "file_id": file_id,
            "chunks": chunks,
            "total_chunks": len(chunks),
            "total_tokens": total_tokens
        }

    except Exception as e:
        logger.error(f"❌ Error fetching chunks for file {file_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gdrive/preview/{file_id}/{page_number}")
async def get_file_page_preview(file_id: str, page_number: int):
    """
    Get a preview image of a specific page from a Google Drive document.
    Supports PDF files by converting them to images.
    """
    if not GDRIVE_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Google Drive integration not available"
        )

    try:
        import tempfile
        import io
        from PIL import Image
        from fastapi.responses import StreamingResponse

        logger.info(f"📸 Generating preview for file {file_id}, page {page_number}")

        # Authenticate with Google Drive
        os.chdir(BASE_DIR)
        sync = GoogleDriveSync()
        if not sync.authenticate():
            raise HTTPException(status_code=401, detail="Failed to authenticate with Google Drive")

        # Get file metadata
        file_metadata = sync.get_file_metadata(file_id)
        if not file_metadata:
            raise HTTPException(status_code=404, detail="File not found in Google Drive")

        file_name = file_metadata['name']
        mime_type = file_metadata['mimeType']

        # Download file to temp directory
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = os.path.join(temp_dir, file_name)

            # Add extension if needed
            extension = sync.supported_mimetypes.get(mime_type, '')
            if extension and not file_name.endswith(extension):
                temp_path += extension

            # Download file
            if not sync.download_file(file_id, file_name, mime_type, temp_path):
                raise HTTPException(status_code=500, detail="Failed to download file")

            # Check if file is PDF
            if mime_type == 'application/pdf' or temp_path.endswith('.pdf'):
                try:
                    from pdf2image import convert_from_path

                    # Convert specific page to image
                    # pdf2image uses 1-based indexing
                    images = convert_from_path(
                        temp_path,
                        first_page=page_number,
                        last_page=page_number,
                        dpi=150  # Good balance between quality and size
                    )

                    if not images:
                        raise HTTPException(status_code=404, detail=f"Page {page_number} not found")

                    # Convert to JPEG for web display
                    img_io = io.BytesIO()
                    images[0].save(img_io, format='JPEG', quality=85)
                    img_io.seek(0)

                    logger.info(f"✅ Generated preview for page {page_number}")

                    return StreamingResponse(
                        img_io,
                        media_type="image/jpeg",
                        headers={
                            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                            "Content-Disposition": f"inline; filename=page_{page_number}.jpg"
                        }
                    )

                except ImportError:
                    raise HTTPException(
                        status_code=501,
                        detail="PDF preview not available. Install pdf2image and poppler-utils."
                    )
                except Exception as e:
                    logger.error(f"❌ Error generating PDF preview: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Failed to generate preview: {str(e)}")

            else:
                # For non-PDF files, return Google Drive thumbnail or web view link
                thumbnail = file_metadata.get('thumbnailLink')
                if thumbnail:
                    # Redirect to Google Drive thumbnail
                    from fastapi.responses import RedirectResponse
                    return RedirectResponse(url=thumbnail)
                else:
                    raise HTTPException(
                        status_code=501,
                        detail="Preview not available for this file type"
                    )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting file preview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/index/clear")
async def clear_index():
    """
    Clear all vectors from the database and reset indexing status.
    This is a destructive operation that requires confirmation.
    """
    try:
        logger.info("🗑️  Clear index request received")

        from langchain_community.vectorstores import PGVector
        from langchain_openai import OpenAIEmbeddings
        from db_config import get_database_url

        # Get database connection
        database_url = get_database_url()
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

        # Delete the entire collection
        logger.info("🗑️  Deleting vector collection...")
        PGVector.from_documents(
            documents=[],  # Empty documents
            embedding=embeddings,
            collection_name="documents",
            connection_string=database_url,
            pre_delete_collection=True,  # This deletes the collection
        )

        # Reset all file indexing statuses in database
        logger.info("🔄 Resetting file indexing statuses...")
        db = next(get_db())
        from db_models import GDriveFile

        # Update all files to mark as not indexed
        result = db.query(GDriveFile).update({
            "is_indexed": False,
            "indexed_at": None,
            "index_chunk_count": 0
        })
        db.commit()

        logger.info(f"✅ Vector database cleared. Reset {result} file statuses.")

        # Reset global agent
        global rag_agent
        rag_agent = None

        return {
            "message": "Vector database cleared successfully",
            "files_reset": result
        }

    except Exception as e:
        logger.error(f"❌ Error clearing index: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/index/build")
async def build_index(background_tasks: BackgroundTasks):
    """
    Build or rebuild the vector database index (background).
    Uses PostgreSQL with pgvector for Railway deployment.
    """
    logger.info("🔨 Index build request received")

    def build_index_task():
        """Background task to build index"""
        from langchain_openai import OpenAIEmbeddings
        from langchain_community.vectorstores import PGVector
        from langchain_core.documents import Document
        from db_config import get_database_url

        import sys
        sys.path.append(str(BASE_DIR / "backend"))
        from document_parser import parse_and_chunk_file, ChunkOptions

        try:
            logger.info("🔨 Starting background index build task...")
            os.chdir(BASE_DIR)

            # Parse and chunk all documents using unstructured
            logger.info(f"📂 Parsing documents from {DATA_DIR} using Unstructured...")
            parse_start = datetime.now()

            # Collect all supported files
            doc_files = []
            for ext in [".pdf", ".docx", ".txt", ".doc", ".pptx", ".html", ".md"]:
                doc_files.extend(DATA_DIR.glob(f"*{ext}"))

            logger.info(f"📄 Found {len(doc_files)} documents to parse")

            # Configure parsing options
            chunk_opts = ChunkOptions(
                max_tokens=800,
                overlap_tokens=100,
                respect_headings=True,
                keep_tables_intact=True,
                combine_short_elements=True,
                strategy="hi_res",  # Use "hi_res" for better OCR/layout parsing (slower)
            )

            # Parse each file and collect chunks
            all_langchain_docs = []
            for doc_file in doc_files:
                try:
                    logger.info(f"📄 Parsing: {doc_file.name}")
                    chunks, elements = parse_and_chunk_file(str(doc_file), chunk_opts)

                    # Convert chunks to LangChain Document format
                    for chunk in chunks:
                        metadata = {
                            "source": chunk.source.get("filename", doc_file.name),
                            "chunk_id": chunk.chunk_id,
                            "tokens": chunk.tokens,
                            "from_elements": len(chunk.from_elements),
                        }
                        # Add page number if available (convert list to first page number)
                        if chunk.page_numbers:
                            metadata["page"] = chunk.page_numbers[0]
                            # Store all page numbers as comma-separated string
                            metadata["pages"] = ",".join(str(p) for p in chunk.page_numbers)

                        # Add section heading if available
                        if chunk.meta.get("section_heading"):
                            metadata["section"] = chunk.meta["section_heading"]

                        # Add bounding box for visual highlighting
                        if chunk.bounding_box:
                            metadata["bounding_box"] = json.dumps(chunk.bounding_box)
                            logger.info(f"💾 Storing bounding box for chunk: {chunk.bounding_box}")
                        else:
                            logger.warning(f"⚠️ No bounding box to store for chunk {chunk.chunk_id[:8]}...")

                        doc = Document(page_content=chunk.text, metadata=metadata)
                        all_langchain_docs.append(doc)

                    logger.info(f"  ✅ {doc_file.name}: {len(chunks)} chunks, {len(elements)} elements")
                except Exception as e:
                    logger.error(f"  ❌ Failed to parse {doc_file.name}: {e}")
                    continue

            parse_elapsed = (datetime.now() - parse_start).total_seconds()
            logger.info(f"✅ Parsed {len(doc_files)} documents into {len(all_langchain_docs)} chunks in {parse_elapsed:.2f}s")

            texts = all_langchain_docs

            # Create embeddings and vector database
            logger.info(f"🧠 Creating embeddings (model=text-embedding-3-small)...")
            embed_start = datetime.now()
            embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

            logger.info(f"💾 Building PostgreSQL vector database with pgvector...")
            database_url = get_database_url()

            # Build vector database with PGVector
            vectordb = PGVector.from_documents(
                documents=texts,
                embedding=embeddings,
                collection_name="documents",
                connection_string=database_url,
                pre_delete_collection=True,  # Clear existing data before inserting
            )

            embed_elapsed = (datetime.now() - embed_start).total_seconds()
            logger.info(f"✅ Vector database built in {embed_elapsed:.2f}s")
            logger.info(f"✅ Indexed {len(texts)} chunks into PostgreSQL")

            logger.info("✅ Index built successfully!")

            # Reset global agent to reload with the new index
            global rag_agent
            rag_agent = None
            logger.info("♻️  Global RAG agent reset (will reload on next query)")

        except Exception as e:
            logger.error(f"❌ Error building index: {e}", exc_info=True)

    # Basic sanity checks
    if not DATA_DIR.exists():
        logger.error(f"❌ Data directory not found: {DATA_DIR}")
        raise HTTPException(status_code=400, detail=f"Data directory not found at {DATA_DIR}")

    files = [f for f in DATA_DIR.glob('*') if f.is_file() and not f.name.startswith('.')]
    logger.info(f"📁 Found {len(files)} files in {DATA_DIR}")

    if not files:
        logger.warning("⚠️  No documents found in data directory")
        raise HTTPException(status_code=400, detail="No documents found in data directory. Please upload documents first.")

    logger.info("🚀 Adding index build task to background queue")
    background_tasks.add_task(build_index_task)
    return {"message": "Index building started in background", "status": "processing"}


# @app.get("/api/index/status")
# async def index_status():
#     """
#     Check if vector database index exists and is ready.
#     Avoids requiring OpenAI just to count chunks.
#     """
#     exists = CHROMA_DIR.exists()

#     if not exists:
#         return {"initialized": False, "ready": False, "chunk_count": 0}

#     try:
#         # Direct Chroma client usage (no embeddings)
#         import chromadb
#         from chromadb.config import Settings

#         client = chromadb.PersistentClient(
#             path=str(CHROMA_DIR),
#             settings=Settings(anonymized_telemetry=False)
#         )

#         # The default collection name used by langchain_community.Chroma is "langchain"
#         coll = client.get_or_create_collection("langchain")
#         count = coll.count()

#         return {"initialized": True, "ready": count > 0, "chunk_count": count}
#     except Exception as e:
#         print(f"Error checking index status: {e}")
#         return {"initialized": True, "ready": False, "chunk_count": 0}

@app.get("/api/index/status")
async def index_status():
    """
    Check if vector database index exists and is ready.
    Queries PostgreSQL to count chunks in the documents collection.
    """
    try:
        from sqlalchemy import create_engine, text
        from db_config import get_database_url

        database_url = get_database_url()
        engine = create_engine(database_url, pool_pre_ping=True)

        # Query the langchain_pg_embedding table for documents collection
        with engine.connect() as conn:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM langchain_pg_embedding WHERE collection_id = "
                "(SELECT uuid FROM langchain_pg_collection WHERE name = 'documents')"
            ))
            count = result.scalar()

        if count is None:
            # Collection doesn't exist yet
            return {"initialized": False, "ready": False, "chunk_count": 0}

        return {"initialized": True, "ready": count > 0, "chunk_count": count}

    except Exception as e:
        logger.error(f"Error checking index status: {e}")
        # If table doesn't exist or other errors, return not initialized
        return {"initialized": False, "ready": False, "chunk_count": 0}

@app.post("/api/index/repair")
async def index_repair(background_tasks: BackgroundTasks):
    """
    Archive a corrupt Chroma index and rebuild in the background.
    """
    if not DATA_DIR.exists():
        raise HTTPException(status_code=400, detail=f"Data directory not found at {DATA_DIR}")

    files = [f for f in DATA_DIR.glob('*') if f.is_file() and not f.name.startswith('.')]
    if not files:
        raise HTTPException(status_code=400, detail="No documents found in data directory. Please upload documents first.")

    if CHROMA_DIR.exists() and is_chroma_corrupt(CHROMA_DIR):
        backup = archive_chroma(CHROMA_DIR)
        msg = f"Archived corrupt index to '{backup.name}'. Rebuilding…"
    else:
        msg = "Index not detected as corrupt. Rebuilding fresh…"
        if CHROMA_DIR.exists():
            backup = archive_chroma(CHROMA_DIR)
            msg = f"Archived existing index to '{backup.name}'. Rebuilding…"

    # Reuse the build_index_task function from /api/index/build endpoint
    # This function uses document_parser with unstructured library
    def build_index_task():
        from langchain_openai import OpenAIEmbeddings
        from langchain_community.vectorstores import Chroma
        from langchain_core.documents import Document
        # --- NumPy 2.0 legacy alias shim (for chromadb) ---
        import numpy as np  # must run BEFORE importing chromadb

        _aliases = {
            "float_": "float64",
            "int_": "int64",
            "uint": "uint64",
        }
        for old_name, new_name in _aliases.items():
            if not hasattr(np, old_name) and hasattr(np, new_name):
                setattr(np, old_name, getattr(np, new_name))
        # ---------------------------------------------------

        import chromadb
        from chromadb.config import Settings
        import sys
        sys.path.append(str(BASE_DIR / "backend"))
        from document_parser import parse_and_chunk_file, ChunkOptions

        try:
            os.chdir(BASE_DIR)

            # Collect all supported files
            doc_files = []
            for ext in [".pdf", ".docx", ".txt", ".doc", ".pptx", ".html", ".md"]:
                doc_files.extend(DATA_DIR.glob(f"*{ext}"))

            # Configure parsing options
            chunk_opts = ChunkOptions(
                max_tokens=800,
                overlap_tokens=100,
                respect_headings=True,
                keep_tables_intact=True,
                strategy="fast",
            )

            # Parse each file and collect chunks
            all_langchain_docs = []
            for doc_file in doc_files:
                try:
                    chunks, _ = parse_and_chunk_file(str(doc_file), chunk_opts)
                    for chunk in chunks:
                        metadata = {
                            "source": chunk.source.get("filename", doc_file.name),
                            "chunk_id": chunk.chunk_id,
                            "tokens": chunk.tokens,
                            "from_elements": len(chunk.from_elements),
                        }
                        if chunk.page_numbers:
                            metadata["page"] = chunk.page_numbers[0]
                            metadata["pages"] = ",".join(str(p) for p in chunk.page_numbers)
                        if chunk.meta.get("section_heading"):
                            metadata["section"] = chunk.meta["section_heading"]
                        doc = Document(page_content=chunk.text, metadata=metadata)
                        all_langchain_docs.append(doc)
                except Exception:
                    continue

            embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
            client = chromadb.PersistentClient(path=str(CHROMA_DIR), settings=Settings(anonymized_telemetry=False))

            # Delete existing collection to ensure clean rebuild
            try:
                client.delete_collection("langchain")
            except Exception:
                pass

            _ = Chroma.from_documents(documents=all_langchain_docs, embedding=embeddings, client=client, collection_name="langchain")

            # Reset global agent
            global rag_agent
            rag_agent = None
        except Exception as e:
            print(f"❌ Error building index: {e}")
            import traceback
            traceback.print_exc()

    background_tasks.add_task(build_index_task)
    return {"message": msg, "status": "processing"}


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Upload a document to the data directory
    """
    logger.info(f"📤 Upload request for file: {file.filename}")

    allowed_extensions = ['.pdf', '.docx', '.txt']
    file_ext = os.path.splitext(file.filename)[1].lower()

    if file_ext not in allowed_extensions:
        logger.warning(f"⚠️  Rejected file with unsupported extension: {file_ext}")
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    file_path = DATA_DIR / file.filename

    try:
        logger.info(f"💾 Reading file content...")
        content = await file.read()
        file_size = len(content)

        logger.info(f"💾 Writing {file_size} bytes to {file_path}")
        with open(file_path, "wb") as f:
            f.write(content)

        logger.info(f"✅ File uploaded successfully: {file.filename} ({file_size} bytes)")

        # Nudge: next query will see the new doc after a rebuild
        return {
            "message": f"File '{file.filename}' uploaded successfully",
            "filename": file.filename,
            "size": file_size
        }

    except Exception as e:
        logger.error(f"❌ Upload failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ======================= Benchmark Endpoints =======================

# Directory to store benchmark suites and results
BENCHMARK_DIR = BASE_DIR / "benchmarks"
BENCHMARK_DIR.mkdir(exist_ok=True)
(BENCHMARK_DIR / "suites").mkdir(exist_ok=True)
(BENCHMARK_DIR / "results").mkdir(exist_ok=True)


@app.post("/api/benchmark/upload")
async def upload_benchmark_suite(file: UploadFile = File(...)):
    """
    Upload a benchmark suite from JSONL file.
    Each line should be a test case JSON object.
    """
    try:
        if not file.filename.endswith('.jsonl'):
            raise HTTPException(status_code=400, detail="File must be .jsonl format")

        content = await file.read()
        lines = content.decode('utf-8').strip().split('\n')

        tests = []
        for i, line in enumerate(lines, 1):
            if line.strip():
                try:
                    tests.append(json.loads(line))
                except json.JSONDecodeError as e:
                    raise HTTPException(status_code=400, detail=f"Invalid JSON on line {i}: {e}")

        if not tests:
            raise HTTPException(status_code=400, detail="No valid tests found in file")

        # Save suite to database
        suite_name = file.filename.replace('.jsonl', '')
        db = next(get_db())
        try:
            suite = create_benchmark_suite(
                db=db,
                name=suite_name,
                test_count=len(tests),
                test_data=json.dumps(tests, ensure_ascii=False)
            )
            logger.info(f"📊 Benchmark suite '{suite_name}' uploaded with {len(tests)} tests")

            return {
                "message": f"Benchmark suite '{suite_name}' uploaded successfully",
                "suite_name": suite_name,
                "test_count": len(tests)
            }
        finally:
            db.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Benchmark upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/benchmark/suites")
async def list_benchmark_suites():
    """List all available benchmark suites"""
    try:
        db = next(get_db())
        try:
            suites = get_benchmark_suites(db)
            return {
                "suites": [
                    {
                        "name": suite.name,
                        "test_count": suite.test_count,
                        "uploaded_at": suite.uploaded_at.isoformat()
                    }
                    for suite in suites
                ]
            }
        finally:
            db.close()

    except Exception as e:
        logger.error(f"❌ Failed to list benchmark suites: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/benchmark/run", response_model=BenchmarkRunResponse)
async def run_benchmark(request: BenchmarkRunRequest):
    """
    Run a benchmark suite and score the results.
    Can provide tests directly or use a stored suite.
    """
    try:
        from backend.benchmark_scorer import BenchmarkScorer

        logger.info(f"🧪 Starting benchmark run: {request.suite_name}")

        db = next(get_db())
        try:
            # Get tests
            if request.tests:
                tests = [t.dict() for t in request.tests]
                suite_name = request.suite_name
                suite_id = None
            else:
                # Load from database
                suite = get_benchmark_suite(db, request.suite_name)
                if not suite:
                    raise HTTPException(status_code=404, detail=f"Benchmark suite '{request.suite_name}' not found")

                tests = json.loads(suite.test_data)
                suite_name = suite.name
                suite_id = suite.id

            if not tests:
                raise HTTPException(status_code=400, detail="No tests to run")

            logger.info(f"📋 Running {len(tests)} tests from suite '{suite_name}'")
            logger.info(f"🤖 Using model: {request.model}")

            # Load settings from database
            policies_dict = None
            try:
                policies_dict = get_settings(db)
                if policies_dict:
                    logger.info("✅ Loaded settings from database for benchmark")
                else:
                    logger.info("📋 No database settings found, using policies.yaml for benchmark")
            except Exception as e:
                logger.warning(f"⚠️  Failed to load settings from database: {e}")
                logger.info("📋 Falling back to policies.yaml for benchmark")

            # Create a dedicated agent instance for this benchmark run
            # (Don't use cached agent to avoid interference with chat)
            from query_agent import RAGAgent
            if request.model == "gpt-5-mini":
                # gpt-5-mini only supports temperature=1 (the default)
                benchmark_agent = LegalRAGAgent(model_name=request.model, temperature=1, policies_dict=policies_dict)
            else:
                benchmark_agent = LegalRAGAgent(model_name=request.model, temperature=0, policies_dict=policies_dict)

            # Run each test through the RAG system
            responses = []
            for i, test in enumerate(tests, 1):
                logger.info(f"🔬 Test {i}/{len(tests)}: {test['id']} - {test['question'][:50]}...")

                try:
                    # Query the RAG system with debug=True
                    result = benchmark_agent.query_debug(test["question"], conversation_id="benchmark")

                    responses.append({
                        "answer": result["answer"],
                        "sources": _sources_from_quotes(result.get("json", {}).get("quotes", [])),
                        "json": result.get("json", {}),
                        "debug": result.get("debug", {})
                    })

                except Exception as e:
                    logger.error(f"❌ Test {test['id']} failed: {e}")
                    responses.append({
                        "answer": f"ERROR: {str(e)}",
                        "sources": [],
                        "json": {"error": str(e)},
                        "debug": {}
                    })

            # Score the results
            scorer = BenchmarkScorer()
            scored_results = scorer.score_suite(tests, responses)

            # Generate run ID and save results to database
            benchmark_run = create_benchmark_run(
                db=db,
                suite_name=suite_name,
                model=request.model,
                summary=scored_results["summary"],
                results_data=json.dumps(scored_results["results"], ensure_ascii=False)
            )
            run_id = benchmark_run.run_id

            logger.info(f"✅ Benchmark complete: {scored_results['summary']['pass_rate']}% pass rate, grade: {scored_results['summary']['grade']}")

            return {
                "run_id": run_id,
                "status": "completed",
                "summary": scored_results["summary"],
                "results": scored_results["results"]
            }
        finally:
            db.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Benchmark run failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def sanitize_json_floats(obj):
    """Recursively replace float('inf') and float('nan') with JSON-compliant values"""
    if isinstance(obj, dict):
        return {k: sanitize_json_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_json_floats(item) for item in obj]
    elif isinstance(obj, float):
        if obj == float('inf'):
            return "unlimited"
        elif obj == float('-inf'):
            return "-unlimited"
        elif obj != obj:  # NaN check
            return None
        else:
            return obj
    else:
        return obj

@app.get("/api/benchmark/results/{run_id}")
async def get_benchmark_results(run_id: str):
    """Get detailed results for a specific benchmark run"""
    try:
        db = next(get_db())
        try:
            run = get_benchmark_run(db, run_id)
            if not run:
                raise HTTPException(status_code=404, detail=f"Benchmark run '{run_id}' not found")

            data = {
                "run_id": run.run_id,
                "suite_name": run.suite.name if run.suite else "unknown",
                "model": run.model,
                "timestamp": run.timestamp.isoformat(),
                "summary": {
                    "total_tests": run.total_tests,
                    "passed": run.passed,
                    "failed": run.failed,
                    "pass_rate": run.pass_rate,
                    "total_score": run.total_score,
                    "total_max": run.total_max,
                    "overall_score": run.overall_score,
                    "grade": run.grade
                },
                "results": json.loads(run.results_data)
            }

            # Sanitize any infinity values
            return sanitize_json_floats(data)
        finally:
            db.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to get benchmark results: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/benchmark/history")
async def get_benchmark_history_endpoint(suite_name: Optional[str] = None, limit: int = 10):
    """
    Get historical benchmark results.
    Optionally filter by suite name and limit the number of results.
    """
    try:
        db = next(get_db())
        try:
            runs = get_benchmark_history(db, suite_name=suite_name, limit=limit)

            all_runs = []
            for run in runs:
                all_runs.append({
                    "run_id": run.run_id,
                    "suite_name": run.suite_name,
                    "model": run.model,
                    "timestamp": run.timestamp.isoformat(),
                    "summary": {
                        "total_tests": run.total_tests,
                        "passed": run.passed,
                        "failed": run.failed,
                        "pass_rate": run.pass_rate,
                        "total_score": run.total_score,
                        "total_max": run.total_max,
                        "overall_score": run.overall_score,
                        "grade": run.grade
                    }
                })

            return {"history": all_runs}
        finally:
            db.close()

    except Exception as e:
        logger.error(f"❌ Failed to get benchmark history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/benchmark/compare")
async def compare_benchmark_runs(run_id_1: str, run_id_2: str):
    """Compare two benchmark runs"""
    try:
        db = next(get_db())
        try:
            # Load both runs from database
            run_1 = get_benchmark_run(db, run_id_1)
            run_2 = get_benchmark_run(db, run_id_2)

            if not run_1:
                raise HTTPException(status_code=404, detail=f"Run '{run_id_1}' not found")
            if not run_2:
                raise HTTPException(status_code=404, detail=f"Run '{run_id_2}' not found")

            # Build summary dicts
            summary_1 = {
                "total_tests": run_1.total_tests,
                "passed": run_1.passed,
                "failed": run_1.failed,
                "pass_rate": run_1.pass_rate,
                "total_score": run_1.total_score,
                "total_max": run_1.total_max,
                "overall_score": run_1.overall_score,
                "grade": run_1.grade
            }
            summary_2 = {
                "total_tests": run_2.total_tests,
                "passed": run_2.passed,
                "failed": run_2.failed,
                "pass_rate": run_2.pass_rate,
                "total_score": run_2.total_score,
                "total_max": run_2.total_max,
                "overall_score": run_2.overall_score,
                "grade": run_2.grade
            }

            # Calculate differences
            comparison = {
                "run_1": {
                    "run_id": run_1.run_id,
                    "timestamp": run_1.timestamp.isoformat(),
                    "summary": summary_1
                },
                "run_2": {
                    "run_id": run_2.run_id,
                    "timestamp": run_2.timestamp.isoformat(),
                    "summary": summary_2
                },
                "delta": {
                    "overall_score": summary_2["overall_score"] - summary_1["overall_score"],
                    "pass_rate": summary_2["pass_rate"] - summary_1["pass_rate"],
                    "passed": summary_2["passed"] - summary_1["passed"]
                }
            }

            return comparison
        finally:
            db.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to compare benchmark runs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ======================= Conversation Endpoints =======================

@app.post("/api/conversations", response_model=ConversationResponse)
async def create_new_conversation(request: ConversationCreate):
    """Create a new conversation"""
    try:
        db = next(get_db())
        conversation = create_conversation(db, title=request.title)
        return conversation.to_dict()
    except Exception as e:
        logger.error(f"❌ Failed to create conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/conversations", response_model=List[ConversationResponse])
async def list_conversations():
    """Get all conversations"""
    try:
        db = next(get_db())
        conversations = get_all_conversations(db, limit=100)
        return [c.to_dict() for c in conversations]
    except Exception as e:
        logger.error(f"❌ Failed to list conversations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/conversations/{conversation_id}", response_model=ConversationDetailResponse)
async def get_conversation_detail(conversation_id: str):
    """Get a conversation with all its messages"""
    try:
        db = next(get_db())
        conversation = get_conversation(db, conversation_id)

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        messages = get_conversation_messages(db, conversation_id)

        return {
            "id": conversation.id,
            "title": conversation.title,
            "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
            "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
            "messages": [m.to_dict() for m in messages]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to get conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, request: ConversationCreate):
    """Update conversation title"""
    try:
        db = next(get_db())
        conversation = update_conversation_title(db, conversation_id, request.title)

        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return conversation.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to update conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation_endpoint(conversation_id: str):
    """Delete a conversation and all its messages"""
    try:
        db = next(get_db())
        success = delete_conversation(db, conversation_id)

        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")

        return {"message": "Conversation deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to delete conversation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ======================= Settings Management =======================

@app.get("/api/settings", response_model=SettingsResponse)
async def get_settings_endpoint():
    """Get current RAG agent settings"""
    try:
        db = next(get_db())
        settings_record = get_latest_settings_record(db)

        if settings_record:
            return settings_record.to_dict()
        else:
            # Return default settings from policies.yaml if no DB settings exist
            import yaml
            policies_path = BASE_DIR / "policies.yaml"

            if policies_path.exists():
                with open(policies_path, 'r') as f:
                    default_settings = yaml.safe_load(f)

                return {
                    "id": 0,
                    "settings": default_settings,
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat()
                }
            else:
                raise HTTPException(status_code=404, detail="No settings found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to get settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/settings/defaults", response_model=SettingsResponse)
async def get_default_settings_endpoint():
    """Get default settings from policies.yaml"""
    try:
        import yaml
        policies_path = BASE_DIR / "policies.yaml"

        if not policies_path.exists():
            raise HTTPException(status_code=404, detail="policies.yaml not found")

        with open(policies_path, 'r') as f:
            default_settings = yaml.safe_load(f)

        return {
            "id": 0,
            "settings": default_settings,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to load default settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/settings", response_model=SettingsResponse)
async def update_settings_endpoint(request: SettingsUpdateRequest):
    """Update RAG agent settings"""
    try:
        db = next(get_db())

        # Validate settings structure
        required_keys = ['disclosures', 'blocked_topics', 'blocked_regex', 'allowed_topics',
                        'banned_phrases', 'answer_style', 'fallback', 'retrieval', 'memory']

        for key in required_keys:
            if key not in request.settings:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing required settings key: {key}"
                )

        # Save settings to database
        settings_record = upsert_settings(db, request.settings)

        # Reset the RAG agent to use new settings
        global rag_agent
        if rag_agent is not None:
            logger.info("🔄 Resetting RAG agent to apply new settings...")
            rag_agent = None  # Will be re-initialized on next query

        logger.info("✅ Settings updated successfully")
        return settings_record.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Failed to update settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ======================= Version Changelog API =======================

class VersionChangelogResponse(BaseModel):
    """Response model for version changelog"""
    version: str
    changelog: List[Dict[str, Any]]

@app.get("/api/version/changelog")
async def get_changelog(response: Response):
    """
    Get the version changelog from database.
    Returns version information and release history.
    """
    # Prevent caching of this endpoint
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    try:
        logger.info("📋 Version changelog endpoint called")

        from db_models import get_version_changelog

        # Get database session properly
        db_gen = get_db()
        db = next(db_gen)

        try:
            # Get all changelog entries
            entries = get_version_changelog(db, limit=20)

            logger.info(f"📋 Found {len(entries)} changelog entries in database")

            # Convert to dict format expected by frontend
            changelog_data = [entry.to_dict() for entry in entries]

            if changelog_data:
                logger.info(f"📋 Latest version in changelog: {changelog_data[0]['version']}")

            # Get the auto-generated version (this should match the frontend)
            import os
            from pathlib import Path

            # Try to read the version config
            current_version = "1.0.0"  # Default fallback
            try:
                version_config_path = Path(__file__).parent.parent / ".version-config.json"
                if version_config_path.exists():
                    with open(version_config_path) as f:
                        import json
                        version_config = json.load(f)

                    # Get commit count (may not work on Railway if git not available)
                    try:
                        import subprocess
                        commit_count = subprocess.check_output(
                            ['git', 'rev-list', '--count', 'HEAD'],
                            stderr=subprocess.DEVNULL
                        ).decode().strip()
                        current_version = f"{version_config['major']}.{version_config['minor']}.{commit_count}"
                        logger.info(f"✅ Generated version: {current_version}")
                    except Exception as git_err:
                        # Git not available, use version from latest changelog entry
                        if changelog_data:
                            current_version = changelog_data[0]['version']
                            logger.warning(f"⚠️ Git not available, using latest changelog version: {current_version}")
                        else:
                            current_version = f"{version_config['major']}.{version_config['minor']}.0"
                            logger.warning(f"⚠️ Git not available and no changelog, using: {current_version}")
                else:
                    logger.warning(f"⚠️ Version config not found at {version_config_path}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to generate version: {e}")

            result = {
                "version": current_version,
                "changelog": changelog_data
            }

            logger.info(f"📤 Returning changelog with version: {result['version']}, {len(changelog_data)} entries")

            return result

        finally:
            # Properly close the database session
            db.close()

    except Exception as e:
        logger.error(f"❌ Failed to fetch changelog: {e}", exc_info=True)
        # Return a simple error response instead of raising HTTPException
        return {
            "version": "1.0.0",
            "changelog": [],
            "error": str(e)
        }


class CreateChangelogRequest(BaseModel):
    """Request model for creating changelog entry"""
    version: str
    date: str  # YYYY-MM-DD format
    changes: List[str]


@app.post("/api/version/changelog")
async def create_changelog(request: CreateChangelogRequest):
    """
    Create or update a changelog entry in the database.

    Requires the version, date, and list of changes.
    """
    try:
        logger.info(f"📝 Creating changelog entry for version {request.version}")

        from db_models import upsert_version_changelog
        from datetime import datetime

        # Parse date
        release_date = datetime.strptime(request.date, "%Y-%m-%d")

        # Get database session
        db_gen = get_db()
        db = next(db_gen)

        try:
            # Create/update the entry
            entry = upsert_version_changelog(
                db,
                version=request.version,
                release_date=release_date,
                changes=request.changes
            )

            logger.info(f"✅ Successfully created/updated version {request.version}")

            return {
                "success": True,
                "version": entry.version,
                "message": f"Changelog for version {request.version} created/updated successfully"
            }

        finally:
            db.close()

    except ValueError as e:
        logger.error(f"❌ Invalid date format: {e}")
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    except Exception as e:
        logger.error(f"❌ Failed to create changelog: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ======================= Serve Frontend Static Files =======================

# Mount frontend static files (built React app)
frontend_dist_path = BASE_DIR / "frontend" / "dist"
if frontend_dist_path.exists():
    # Serve static assets (JS, CSS, images, etc.)
    app.mount("/assets", StaticFiles(directory=str(frontend_dist_path / "assets")), name="assets")

    # Serve index.html for all other routes (SPA routing)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str, response: Response):
        """Serve the React frontend for all non-API routes"""
        # Don't serve frontend for API routes
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")

        # Serve index.html for all other routes (React Router will handle routing)
        index_path = frontend_dist_path / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        else:
            raise HTTPException(status_code=404, detail="Frontend not built")
else:
    logger.warning("⚠️  Frontend dist directory not found - frontend will not be served")
    logger.warning(f"   Expected path: {frontend_dist_path}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
