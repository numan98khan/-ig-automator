"""
Database models for conversation persistence and Google Drive file tracking.

This module defines SQLAlchemy models for storing chat conversations,
messages, and Google Drive file indexing status in PostgreSQL.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer, Boolean, create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker, Session
from sqlalchemy.sql import func
import uuid

from db_config import get_database_url

Base = declarative_base()


class Conversation(Base):
    """
    Represents a chat conversation.

    Attributes:
        id: Unique conversation identifier (UUID)
        title: Conversation title (auto-generated from first message)
        created_at: Timestamp when conversation was created
        updated_at: Timestamp when conversation was last updated
        messages: Related messages in this conversation
    """
    __tablename__ = 'conversations'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(255), nullable=False, default="New Conversation")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationship to messages
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")

    def to_dict(self):
        """Convert conversation to dictionary for API responses."""
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "message_count": len(self.messages) if self.messages else 0
        }


class Message(Base):
    """
    Represents a single message in a conversation.

    Attributes:
        id: Unique message identifier (auto-incrementing)
        conversation_id: Foreign key to parent conversation
        role: Message role ('user' or 'assistant')
        content: Message content/text
        sources: JSON string of source documents (for assistant messages)
        created_at: Timestamp when message was created
        conversation: Related conversation object
    """
    __tablename__ = 'messages'

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(36), ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False)
    role = Column(String(20), nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    sources = Column(Text, nullable=True)  # JSON string of source documents
    observability = Column(Text, nullable=True)  # JSON string of debug/observability data
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationship to conversation
    conversation = relationship("Conversation", back_populates="messages")

    def to_dict(self):
        """Convert message to dictionary for API responses."""
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "sources": self.sources,
            "observability": self.observability,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class GDriveFile(Base):
    """
    Represents a Google Drive file and its indexing status.

    Attributes:
        file_id: Google Drive file ID (primary key)
        name: File name
        mime_type: MIME type of the file
        size: File size in bytes
        modified_time: Last modified time from Google Drive
        web_view_link: Link to view file in Google Drive
        is_indexed: Whether the file has been indexed
        indexed_at: Timestamp when file was indexed
        index_chunk_count: Number of chunks created during indexing
    """
    __tablename__ = 'gdrive_files'

    file_id = Column(String(255), primary_key=True)
    name = Column(String(500), nullable=False)
    mime_type = Column(String(200), nullable=False)
    size = Column(Integer, nullable=True)
    modified_time = Column(DateTime(timezone=True), nullable=True)
    web_view_link = Column(String(1000), nullable=True)
    is_indexed = Column(Boolean, default=False, nullable=False)
    indexed_at = Column(DateTime(timezone=True), nullable=True)
    index_chunk_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def to_dict(self):
        """Convert file to dictionary for API responses."""
        return {
            "file_id": self.file_id,
            "name": self.name,
            "mime_type": self.mime_type,
            "size": self.size,
            "modified_time": self.modified_time.isoformat() if self.modified_time else None,
            "web_view_link": self.web_view_link,
            "is_indexed": self.is_indexed,
            "indexed_at": self.indexed_at.isoformat() if self.indexed_at else None,
            "index_chunk_count": self.index_chunk_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


# Database session management
_engine = None
_SessionLocal = None


def init_database():
    """
    Initialize database connection and create tables.
    Should be called once at application startup.

    Returns:
        bool: True if successful, False otherwise
    """
    global _engine, _SessionLocal

    try:
        database_url = get_database_url()

        # Create engine with timeout settings for Railway
        _engine = create_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=3600,  # Recycle connections after 1 hour
            connect_args={
                "connect_timeout": 10,
                "application_name": "lawrag_app"
            }
        )

        # Test connection
        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        # Create tables if they don't exist
        Base.metadata.create_all(bind=_engine)

        # Run migrations to add any missing columns
        from db_migrations import run_migrations
        run_migrations(_engine)

        # Create session factory
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)

        print("✅ Database initialized and conversation tables created")
        return True

    except Exception as e:
        print(f"⚠️  Failed to initialize conversation database: {e}")
        print(f"   The application will start without conversation persistence")
        print(f"   Make sure DATABASE_URL environment variable is set correctly")
        return False


def get_db() -> Session:
    """
    Get a database session.
    Use with context manager or remember to close.

    Example:
        with get_db() as db:
            conversations = db.query(Conversation).all()
    """
    if _SessionLocal is None:
        success = init_database()
        if not success:
            raise Exception("Database not initialized. Check DATABASE_URL environment variable.")

    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Convenience functions for conversation management

def create_conversation(db: Session, title: str = "New Conversation") -> Conversation:
    """Create a new conversation."""
    conversation = Conversation(title=title)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def get_conversation(db: Session, conversation_id: str) -> Optional[Conversation]:
    """Get a conversation by ID."""
    return db.query(Conversation).filter(Conversation.id == conversation_id).first()


def get_all_conversations(db: Session, limit: int = 50) -> list[Conversation]:
    """Get all conversations, ordered by most recent."""
    return db.query(Conversation).order_by(Conversation.updated_at.desc()).limit(limit).all()


def update_conversation_title(db: Session, conversation_id: str, title: str) -> Optional[Conversation]:
    """Update conversation title."""
    conversation = get_conversation(db, conversation_id)
    if conversation:
        conversation.title = title
        db.commit()
        db.refresh(conversation)
    return conversation


def delete_conversation(db: Session, conversation_id: str) -> bool:
    """Delete a conversation and all its messages."""
    conversation = get_conversation(db, conversation_id)
    if conversation:
        db.delete(conversation)
        db.commit()
        return True
    return False


def add_message(
    db: Session,
    conversation_id: str,
    role: str,
    content: str,
    sources: Optional[str] = None,
    observability: Optional[str] = None
) -> Message:
    """Add a message to a conversation."""
    message = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        sources=sources,
        observability=observability
    )
    db.add(message)

    # Update conversation's updated_at timestamp
    conversation = get_conversation(db, conversation_id)
    if conversation:
        conversation.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(message)
    return message


def get_conversation_messages(db: Session, conversation_id: str) -> list[Message]:
    """Get all messages for a conversation."""
    return db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.asc()).all()


def auto_generate_title(content: str, max_length: int = 50) -> str:
    """
    Generate a conversation title from the first user message.

    Args:
        content: The message content
        max_length: Maximum title length

    Returns:
        A shortened title
    """
    # Remove extra whitespace
    title = " ".join(content.split())

    # Truncate if too long
    if len(title) > max_length:
        title = title[:max_length].rsplit(' ', 1)[0] + "..."

    return title or "New Conversation"


# Google Drive file management functions

def upsert_gdrive_file(
    db: Session,
    file_id: str,
    name: str,
    mime_type: str,
    size: Optional[int] = None,
    modified_time: Optional[datetime] = None,
    web_view_link: Optional[str] = None
) -> GDriveFile:
    """
    Insert or update a Google Drive file record.
    """
    existing = db.query(GDriveFile).filter(GDriveFile.file_id == file_id).first()

    if existing:
        # Update existing record
        existing.name = name
        existing.mime_type = mime_type
        existing.size = size
        existing.modified_time = modified_time
        existing.web_view_link = web_view_link
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    else:
        # Create new record
        gdrive_file = GDriveFile(
            file_id=file_id,
            name=name,
            mime_type=mime_type,
            size=size,
            modified_time=modified_time,
            web_view_link=web_view_link
        )
        db.add(gdrive_file)
        db.commit()
        db.refresh(gdrive_file)
        return gdrive_file


def mark_file_indexed(db: Session, file_id: str, chunk_count: int = 0) -> Optional[GDriveFile]:
    """
    Mark a file as indexed with the number of chunks created.
    """
    gdrive_file = db.query(GDriveFile).filter(GDriveFile.file_id == file_id).first()
    if gdrive_file:
        gdrive_file.is_indexed = True
        gdrive_file.indexed_at = datetime.utcnow()
        gdrive_file.index_chunk_count = chunk_count
        db.commit()
        db.refresh(gdrive_file)
    return gdrive_file


def get_gdrive_file(db: Session, file_id: str) -> Optional[GDriveFile]:
    """
    Get a Google Drive file record by ID.
    """
    return db.query(GDriveFile).filter(GDriveFile.file_id == file_id).first()


def get_all_gdrive_files(db: Session, indexed_only: bool = False) -> list[GDriveFile]:
    """
    Get all Google Drive file records.

    Args:
        indexed_only: If True, only return indexed files
    """
    query = db.query(GDriveFile)
    if indexed_only:
        query = query.filter(GDriveFile.is_indexed == True)
    return query.order_by(GDriveFile.name.asc()).all()


def get_indexed_file_ids(db: Session) -> set[str]:
    """
    Get a set of all indexed file IDs for quick lookup.
    """
    results = db.query(GDriveFile.file_id).filter(GDriveFile.is_indexed == True).all()
    return {file_id for (file_id,) in results}


# Benchmark models

class BenchmarkSuite(Base):
    """
    Represents a benchmark test suite.
    """
    __tablename__ = 'benchmark_suites'

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), unique=True, nullable=False)
    test_count = Column(Integer, nullable=False)
    test_data = Column(Text, nullable=False)  # JSON string of test cases
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationship to benchmark runs
    runs = relationship("BenchmarkRun", back_populates="suite", cascade="all, delete-orphan")

    def to_dict(self):
        """Convert suite to dictionary for API responses."""
        return {
            "name": self.name,
            "test_count": self.test_count,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None
        }


class BenchmarkRun(Base):
    """
    Represents a single benchmark run with results.
    """
    __tablename__ = 'benchmark_runs'

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    suite_id = Column(Integer, ForeignKey('benchmark_suites.id', ondelete='CASCADE'), nullable=False)
    suite_name = Column(String(255), nullable=False)
    model = Column(String(100), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Summary data
    total_tests = Column(Integer, nullable=False)
    passed = Column(Integer, nullable=False)
    failed = Column(Integer, nullable=False)
    pass_rate = Column(Integer, nullable=False)  # Stored as percentage (0-100)
    total_score = Column(Integer, nullable=False)
    total_max = Column(Integer, nullable=False)
    overall_score = Column(Integer, nullable=False)  # Stored as percentage (0-100)
    grade = Column(String(10), nullable=False)

    # Detailed results as JSON
    results_data = Column(Text, nullable=False)  # JSON string of test results

    # Relationship to suite
    suite = relationship("BenchmarkSuite", back_populates="runs")

    def to_dict(self):
        """Convert run to dictionary for API responses."""
        return {
            "run_id": self.run_id,
            "suite_name": self.suite_name,
            "model": self.model,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "summary": {
                "total_tests": self.total_tests,
                "passed": self.passed,
                "failed": self.failed,
                "pass_rate": self.pass_rate,
                "total_score": self.total_score,
                "total_max": self.total_max,
                "overall_score": self.overall_score,
                "grade": self.grade
            }
        }


# Benchmark management functions

def create_benchmark_suite(db: Session, name: str, test_data: str, test_count: int) -> BenchmarkSuite:
    """Create or update a benchmark suite."""
    existing = db.query(BenchmarkSuite).filter(BenchmarkSuite.name == name).first()

    if existing:
        # Update existing
        existing.test_data = test_data
        existing.test_count = test_count
        existing.uploaded_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    else:
        # Create new
        suite = BenchmarkSuite(name=name, test_data=test_data, test_count=test_count)
        db.add(suite)
        db.commit()
        db.refresh(suite)
        return suite


def get_benchmark_suites(db: Session) -> list[BenchmarkSuite]:
    """Get all benchmark suites."""
    return db.query(BenchmarkSuite).order_by(BenchmarkSuite.uploaded_at.desc()).all()


def get_benchmark_suite(db: Session, name: str) -> Optional[BenchmarkSuite]:
    """Get a specific benchmark suite by name."""
    return db.query(BenchmarkSuite).filter(BenchmarkSuite.name == name).first()


def create_benchmark_run(
    db: Session,
    suite_name: str,
    model: Optional[str],
    summary: dict,
    results_data: str
) -> BenchmarkRun:
    """Create a new benchmark run."""
    suite = get_benchmark_suite(db, suite_name)
    if not suite:
        raise ValueError(f"Suite '{suite_name}' not found")

    run = BenchmarkRun(
        suite_id=suite.id,
        suite_name=suite_name,
        model=model,
        total_tests=summary['total_tests'],
        passed=summary['passed'],
        failed=summary['failed'],
        pass_rate=summary['pass_rate'],
        total_score=summary['total_score'],
        total_max=summary['total_max'],
        overall_score=summary['overall_score'],
        grade=summary['grade'],
        results_data=results_data
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def get_benchmark_run(db: Session, run_id: str) -> Optional[BenchmarkRun]:
    """Get a specific benchmark run by ID."""
    return db.query(BenchmarkRun).filter(BenchmarkRun.run_id == run_id).first()


def get_benchmark_history(db: Session, suite_name: Optional[str] = None, limit: int = 10) -> list[BenchmarkRun]:
    """Get benchmark run history."""
    query = db.query(BenchmarkRun)
    if suite_name:
        query = query.filter(BenchmarkRun.suite_name == suite_name)
    return query.order_by(BenchmarkRun.timestamp.desc()).limit(limit).all()


# Settings model

class Settings(Base):
    """
    Represents system settings for the RAG agent.
    Stores all policy and configuration settings as JSON.
    """
    __tablename__ = 'settings'

    id = Column(Integer, primary_key=True, autoincrement=True)
    settings_data = Column(Text, nullable=False)  # JSON string of all settings
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def to_dict(self):
        """Convert settings to dictionary for API responses."""
        import json
        return {
            "id": self.id,
            "settings": json.loads(self.settings_data),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


def get_settings(db: Session) -> Optional[dict]:
    """
    Get the current settings from database.
    Returns the most recent settings record, or None if no settings exist.
    """
    import json
    settings_record = db.query(Settings).order_by(Settings.id.desc()).first()
    if settings_record:
        return json.loads(settings_record.settings_data)
    return None


def upsert_settings(db: Session, settings_dict: dict) -> Settings:
    """
    Create or update settings in database.
    Always creates a new record to maintain history.

    Args:
        db: Database session
        settings_dict: Dictionary containing all settings

    Returns:
        Settings: The created settings record
    """
    import json

    settings = Settings(
        settings_data=json.dumps(settings_dict, indent=2)
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def get_latest_settings_record(db: Session) -> Optional[Settings]:
    """Get the latest settings record (including metadata)."""
    return db.query(Settings).order_by(Settings.id.desc()).first()


# Version Changelog model

class VersionChangelog(Base):
    """
    Represents a version changelog entry.
    Stores version information and release notes.
    """
    __tablename__ = 'version_changelog'

    id = Column(Integer, primary_key=True, autoincrement=True)
    version = Column(String(20), nullable=False, unique=True)
    release_date = Column(DateTime(timezone=True), nullable=False)
    changes = Column(Text, nullable=False)  # JSON array of change strings
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def to_dict(self):
        """Convert changelog entry to dictionary for API responses."""
        import json
        return {
            "version": self.version,
            "date": self.release_date.strftime("%Y-%m-%d"),
            "changes": json.loads(self.changes)
        }


def get_version_changelog(db: Session, limit: int = 10) -> list[VersionChangelog]:
    """
    Get version changelog entries, ordered by version (newest first).

    Args:
        db: Database session
        limit: Maximum number of entries to return

    Returns:
        List of VersionChangelog entries
    """
    return db.query(VersionChangelog).order_by(VersionChangelog.release_date.desc()).limit(limit).all()


def upsert_version_changelog(db: Session, version: str, release_date: datetime, changes: list[str]) -> VersionChangelog:
    """
    Create or update a version changelog entry.

    Args:
        db: Database session
        version: Version string (e.g., "1.4.1")
        release_date: Release date
        changes: List of change descriptions

    Returns:
        VersionChangelog: The created or updated entry
    """
    import json

    existing = db.query(VersionChangelog).filter(VersionChangelog.version == version).first()

    if existing:
        # Update existing
        existing.release_date = release_date
        existing.changes = json.dumps(changes)
        db.commit()
        db.refresh(existing)
        return existing
    else:
        # Create new
        entry = VersionChangelog(
            version=version,
            release_date=release_date,
            changes=json.dumps(changes)
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry


if __name__ == "__main__":
    """Test database setup."""
    print("=" * 80)
    print("🗄️  CONVERSATION DATABASE SETUP")
    print("=" * 80)

    # Initialize database
    init_database()

    # Test creating a conversation
    print("\n📝 Testing conversation creation...")
    db = next(get_db())

    try:
        # Create test conversation
        conv = create_conversation(db, "Test Conversation")
        print(f"✅ Created conversation: {conv.id}")

        # Add test messages
        add_message(db, conv.id, "user", "What is the refund policy?")
        add_message(db, conv.id, "assistant", "According to our documents, refunds are processed within 30 days.", sources='[{"source": "policy.pdf"}]')

        print(f"✅ Added messages to conversation")

        # Retrieve and display
        conversations = get_all_conversations(db)
        print(f"\n📋 Found {len(conversations)} conversation(s)")

        for c in conversations:
            print(f"   - {c.title} ({c.message_count} messages)")

        # Clean up test data
        delete_conversation(db, conv.id)
        print(f"\n🧹 Cleaned up test data")

    finally:
        db.close()

    print("\n" + "=" * 80)
    print("✅ Database setup complete!")
    print("=" * 80)
