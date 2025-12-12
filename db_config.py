"""
PostgreSQL database configuration for Railway deployment.

This module handles database connections and pgvector setup for the vector store.
"""
import os
from typing import Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

# Database configuration
def get_database_url() -> str:
    """
    Get database URL from environment variables.

    Railway automatically provides DATABASE_URL for PostgreSQL services.
    Falls back to local PostgreSQL for development.

    Returns:
        PostgreSQL connection URL
    """
    # Railway provides DATABASE_URL
    database_url = os.getenv("DATABASE_URL")

    # If DATABASE_URL starts with postgres:// (Railway old format),
    # convert to postgresql://
    if database_url and database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    # Fallback to local PostgreSQL for development
    if not database_url:
        database_url = os.getenv(
            "POSTGRES_URL",
            "postgresql://postgres:postgres@localhost:5432/rag_db"
        )

    return database_url


def create_db_engine(pool_size: int = 5, max_overflow: int = 10):
    """
    Create SQLAlchemy engine for database connections.

    Args:
        pool_size: Number of connections to keep in pool
        max_overflow: Max connections beyond pool_size

    Returns:
        SQLAlchemy engine instance
    """
    database_url = get_database_url()

    # For Railway, use NullPool to avoid connection pool issues
    if os.getenv("RAILWAY_ENVIRONMENT"):
        engine = create_engine(
            database_url,
            poolclass=NullPool,
            echo=False
        )
    else:
        # For local development, use connection pooling
        engine = create_engine(
            database_url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_pre_ping=True,  # Verify connections before using
            echo=False
        )

    return engine


def init_pgvector_extension():
    """
    Initialize pgvector extension in the database.
    This must be run once before using vector operations.

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        engine = create_db_engine()

        with engine.connect() as conn:
            # Create pgvector extension
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()

        print("✅ pgvector extension initialized successfully")
        return True

    except Exception as e:
        print(f"❌ Error initializing pgvector extension: {e}")
        print("   Make sure your PostgreSQL database supports the pgvector extension")
        return False


def test_connection() -> bool:
    """
    Test database connection.

    Returns:
        bool: True if connection successful, False otherwise
    """
    try:
        engine = create_db_engine()

        with engine.connect() as conn:
            result = conn.execute(text("SELECT version()"))
            version = result.fetchone()[0]
            print(f"✅ Database connection successful")
            print(f"   PostgreSQL version: {version[:50]}...")

        return True

    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False


def get_connection_info() -> dict:
    """
    Get database connection information (for debugging).

    Returns:
        dict: Connection information
    """
    database_url = get_database_url()

    # Parse connection info (hide password)
    try:
        from urllib.parse import urlparse
        parsed = urlparse(database_url)

        return {
            "host": parsed.hostname,
            "port": parsed.port,
            "database": parsed.path.lstrip('/'),
            "username": parsed.username,
            "is_railway": bool(os.getenv("RAILWAY_ENVIRONMENT")),
            "has_database_url": bool(os.getenv("DATABASE_URL"))
        }
    except Exception:
        return {"error": "Failed to parse database URL"}


if __name__ == "__main__":
    """Test database connection and setup."""
    print("=" * 80)
    print("📊 DATABASE CONNECTION TEST")
    print("=" * 80)

    # Show connection info
    info = get_connection_info()
    print("\n🔧 Connection Info:")
    for key, value in info.items():
        print(f"   {key}: {value}")

    # Test connection
    print("\n🔌 Testing connection...")
    if test_connection():
        print("\n🔧 Initializing pgvector extension...")
        init_pgvector_extension()

    print("\n" + "=" * 80)
